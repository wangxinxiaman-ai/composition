# Use Node.js 18 as the base image
FROM node:18

# Install Python 3, pip, and system dependencies for OpenCV
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package.json and install Node.js dependencies
COPY package.json ./

# Install npm dependencies (using default registry for stability)
RUN npm install

# Copy requirements.txt and install Python dependencies
COPY requirements.txt ./

# Install Python dependencies (using default PyPI for stability)
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY server.js ./
COPY src ./src
COPY templates ./templates
COPY public ./public

# Expose port 80 (CloudBase default)
EXPOSE 80

# Start the server
CMD ["node", "server.js"]
