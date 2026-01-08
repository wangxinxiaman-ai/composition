import cv2
import numpy as np
import sys
import os

def order_points(pts):
    # 初始化坐标点：左上，右上，右下，左下
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect

def four_point_transform(image, pts):
    rect = order_points(pts)
    (tl, tr, br, bl) = rect
    
    # 计算新图像的宽度
    widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    maxWidth = max(int(widthA), int(widthB))
    
    # 计算新图像的高度
    heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    maxHeight = max(int(heightA), int(heightB))
    
    dst = np.array([
        [0, 0],
        [maxWidth - 1, 0],
        [maxWidth - 1, maxHeight - 1],
        [0, maxHeight - 1]], dtype="float32")
        
    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
    return warped

def enhance_image(image):
    # 转换为Lab颜色空间
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    
    # 限制对比度增强的强度
    # 降低 clipLimit 从 2.0 到 1.0 或 0.5，减少背景透字被增强的风险
    clahe = cv2.createCLAHE(clipLimit=1.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    
    # 合并通道
    limg = cv2.merge((cl, a, b))
    
    # 转换回BGR
    enhanced = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
    
    # 降低锐化强度，或者对于手写识别来说，过度的锐化反而会引入噪点
    # 使用更温和的锐化核，或者跳过锐化
    # kernel = np.array([[0, -1, 0], 
    #                    [-1, 5, -1], 
    #                    [0, -1, 0]])
    # sharpened = cv2.filter2D(enhanced, -1, kernel)
    
    # 返回仅做轻微对比度增强的图像，跳过锐化
    return enhanced

def crop_to_content_grid(image):
    try:
        # 1. 灰度化
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # 2. 二值化 (反转，使得线条和文字为白)
        # 使用自适应阈值处理光照不均
        binary = cv2.adaptiveThreshold(~gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, -2)
        
        # 3. 提取横线和竖线来定位表格/格线区域
        # 如果是作文纸，格线通常很明显
        rows, cols = binary.shape
        scale = 20 # 这个值越大，检测到的线条越长
        
        # 识别横线
        kernel_h = cv2.getStructuringElement(cv2.MORPH_RECT, (cols // scale, 1))
        eroded_h = cv2.erode(binary, kernel_h)
        dilated_h = cv2.dilate(eroded_h, kernel_h)
        
        # 识别竖线
        kernel_v = cv2.getStructuringElement(cv2.MORPH_RECT, (1, rows // scale))
        eroded_v = cv2.erode(binary, kernel_v)
        dilated_v = cv2.dilate(eroded_v, kernel_v)
        
        # 合并横竖线，形成网格掩膜
        grid_mask = cv2.add(dilated_h, dilated_v)
        
        # 4. 寻找网格的最大轮廓
        cnts = cv2.findContours(grid_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cnts = cnts[0] if len(cnts) == 2 else cnts[1]
        
        if len(cnts) > 0:
            # 找面积最大的轮廓，假设它是作文格区域
            c = max(cnts, key=cv2.contourArea)
            x, y, w, h = cv2.boundingRect(c)
            
            # 只有当检测到的区域足够大时才裁剪（例如面积 > 图像面积的 10%）
            if w * h > (rows * cols) * 0.1:
                # 适当留一点 padding (例如 5像素)，防止切断边缘文字
                pad = 10
                x = max(0, x - pad)
                y = max(0, y - pad)
                w = min(cols - x, w + 2*pad)
                h = min(rows - y, h + 2*pad)
                
                print(f"Cropping to grid content: x={x}, y={y}, w={w}, h={h}", file=sys.stderr)
                return image[y:y+h, x:x+w]
        
        print("No significant grid found, skipping crop.", file=sys.stderr)
        return image
        
    except Exception as e:
        print(f"Crop failed: {e}", file=sys.stderr)
        return image

def process_image(image_path):
    try:
        # 读取图片，处理中文路径
        # cv2.imread 不支持中文路径，使用 numpy fromfile 绕过
        img_np = np.fromfile(image_path, dtype=np.uint8)
        image = cv2.imdecode(img_np, cv2.IMREAD_COLOR)
        
        if image is None:
            print(f"Error: Could not read image", file=sys.stderr)
            return

        ratio = image.shape[0] / 500.0
        orig = image.copy()
        
        # 1. 边缘检测与轮廓寻找 (用于裁剪纠偏)
        # 调整大小以加速处理
        resized = cv2.resize(image, (int(image.shape[1] / ratio), 500))
        
        # 灰度化
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        
        # 高斯模糊降噪
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Canny边缘检测
        edged = cv2.Canny(gray, 75, 200)
        
        # 寻找轮廓
        cnts = cv2.findContours(edged.copy(), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        cnts = cnts[0] if len(cnts) == 2 else cnts[1]
        cnts = sorted(cnts, key=cv2.contourArea, reverse=True)[:5]
        
        screenCnt = None
        resized_area = resized.shape[0] * resized.shape[1]

        for c in cnts:
            # 近似轮廓
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            
            # 如果近似轮廓有4个点，且面积足够大（至少占画面的 20%，避免误识别格子或文字块）
            if len(approx) == 4 and cv2.contourArea(c) > resized_area * 0.2:
                screenCnt = approx
                break
        
        warped = orig
        if screenCnt is not None:
            print("Found document contour, applying perspective transform.", file=sys.stderr)
            try:
                warped = four_point_transform(orig, screenCnt.reshape(4, 2) * ratio)
                # 检查变换后的图像是否过小或异常
                if warped.shape[0] < 100 or warped.shape[1] < 100:
                    print("Warped image too small, reverting to original.", file=sys.stderr)
                    warped = orig
            except Exception as e:
                 print(f"Perspective transform failed: {e}, reverting to original.", file=sys.stderr)
                 warped = orig
        else:
            print("Document contour not found (or too small), skipping perspective transform.", file=sys.stderr)

        # 2. 图像增强 (降噪、锐化、对比度)
        enhanced = enhance_image(warped)
        
        # 3. 基于内容的裁剪 (去掉页眉页脚)
        # 在增强后的图像上进行裁剪，因为增强后的线条更清晰
        final_image = crop_to_content_grid(enhanced)
        
        # 4. 二值化 (可选)
        # 如果需要二值化效果：
        # gray_enhanced = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
        # binary = cv2.adaptiveThreshold(gray_enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
        
        # 保存处理后的图片
        # 构造新文件名
        dir_name, file_name = os.path.split(image_path)
        name, ext = os.path.splitext(file_name)
        new_file_name = f"{name}_processed{ext}"
        save_path = os.path.join(dir_name, new_file_name)
        
        # cv2.imwrite 不支持中文路径，使用 cv2.imencode
        is_success, im_buf = cv2.imencode(ext, final_image)
        if is_success:
            im_buf.tofile(save_path)
            print(save_path) # 输出路径供 nodejs 读取
        else:
            print(f"Error: Could not save image", file=sys.stderr)
            
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # 设置控制台编码为 utf-8 避免中文路径乱码
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
        process_image(sys.argv[1])
