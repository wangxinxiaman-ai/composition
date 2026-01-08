var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import { Db } from '@cloudbase/database';
var COMPONENT_NAME = 'database';
function database(dbConfig) {
    var _a = this.platform, adapter = _a.adapter, runtime = _a.runtime;
    Db.reqClass = this.request.constructor;
    Db.getAccessToken = this.authInstance ? this.authInstance.getAccessToken.bind(this.authInstance) : function () { return ''; };
    Db.runtime = runtime;
    if (this.wsClientClass) {
        Db.wsClass = adapter.wsClass;
        Db.wsClientClass = this.wsClientClass;
    }
    if (!Db.ws) {
        Db.ws = null;
    }
    return new Db(__assign(__assign(__assign({}, this.config), { _fromApp: this }), dbConfig));
}
var component = {
    name: COMPONENT_NAME,
    entity: {
        database: database,
    },
};
try {
    cloudbase.registerComponent(component);
}
catch (e) { }
export function registerDatabase(app) {
    try {
        app.registerComponent(component);
    }
    catch (e) {
        console.warn(e);
    }
}
try {
    window.registerDatabase = registerDatabase;
}
catch (e) { }

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQUEsT0FBTyxFQUFFLEVBQUUsRUFBRSxNQUFNLHFCQUFxQixDQUFBO0FBT3hDLElBQU0sY0FBYyxHQUFHLFVBQVUsQ0FBQTtBQUVqQyxTQUFTLFFBQVEsQ0FBQyxRQUFpQjtJQUMzQixJQUFBLEtBQXVCLElBQUksQ0FBQyxRQUFRLEVBQWxDLE9BQU8sYUFBQSxFQUFFLE9BQU8sYUFBa0IsQ0FBQTtJQUUxQyxFQUFFLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFBO0lBRXRDLEVBQUUsQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBTSxPQUFBLEVBQUUsRUFBRixDQUFFLENBQUE7SUFDM0csRUFBRSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUE7SUFDcEIsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFO1FBQ3RCLEVBQUUsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQTtRQUM1QixFQUFFLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUE7S0FDdEM7SUFFRCxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUNWLEVBQUUsQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFBO0tBQ2I7SUFFRCxPQUFPLElBQUksRUFBRSxnQ0FBTSxJQUFJLENBQUMsTUFBTSxLQUFFLFFBQVEsRUFBRSxJQUFJLEtBQUssUUFBUSxFQUFHLENBQUE7QUFDaEUsQ0FBQztBQUVELElBQU0sU0FBUyxHQUF3QjtJQUNyQyxJQUFJLEVBQUUsY0FBYztJQUNwQixNQUFNLEVBQUU7UUFDTixRQUFRLFVBQUE7S0FDVDtDQUNGLENBQUE7QUFDRCxJQUFJO0lBQ0YsU0FBUyxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxDQUFBO0NBQ3ZDO0FBQUMsT0FBTyxDQUFDLEVBQUUsR0FBRztBQUVmLE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxHQUFvQztJQUNuRSxJQUFJO1FBQ0YsR0FBRyxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxDQUFBO0tBQ2pDO0lBQUMsT0FBTyxDQUFDLEVBQUU7UUFDVixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBO0tBQ2hCO0FBQ0gsQ0FBQztBQUVELElBQUk7SUFDRCxNQUFjLENBQUMsZ0JBQWdCLEdBQUcsZ0JBQWdCLENBQUE7Q0FDcEQ7QUFBQyxPQUFPLENBQUMsRUFBRSxHQUFFIiwiZmlsZSI6ImluZGV4LmVzbS5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERiIH0gZnJvbSAnQGNsb3VkYmFzZS9kYXRhYmFzZSdcbmltcG9ydCB7IElDbG91ZGJhc2UgfSBmcm9tICdAY2xvdWRiYXNlL3R5cGVzJ1xuaW1wb3J0IHsgSUNsb3VkYmFzZUNvbXBvbmVudCB9IGZyb20gJ0BjbG91ZGJhc2UvdHlwZXMvY29tcG9uZW50J1xuaW1wb3J0IGNsb3VkYmFzZU5TIGZyb20gJy4uLy4uL2luZGV4J1xuXG5kZWNsYXJlIGNvbnN0IGNsb3VkYmFzZTogSUNsb3VkYmFzZVxuXG5jb25zdCBDT01QT05FTlRfTkFNRSA9ICdkYXRhYmFzZSdcblxuZnVuY3Rpb24gZGF0YWJhc2UoZGJDb25maWc/OiBvYmplY3QpIHtcbiAgY29uc3QgeyBhZGFwdGVyLCBydW50aW1lIH0gPSB0aGlzLnBsYXRmb3JtXG5cbiAgRGIucmVxQ2xhc3MgPSB0aGlzLnJlcXVlc3QuY29uc3RydWN0b3JcbiAgLy8g5pyq55m75b2V5oOF5Ya15LiL5Lyg5YWl56m65Ye95pWwXG4gIERiLmdldEFjY2Vzc1Rva2VuID0gdGhpcy5hdXRoSW5zdGFuY2UgPyB0aGlzLmF1dGhJbnN0YW5jZS5nZXRBY2Nlc3NUb2tlbi5iaW5kKHRoaXMuYXV0aEluc3RhbmNlKSA6ICgpID0+ICcnXG4gIERiLnJ1bnRpbWUgPSBydW50aW1lXG4gIGlmICh0aGlzLndzQ2xpZW50Q2xhc3MpIHtcbiAgICBEYi53c0NsYXNzID0gYWRhcHRlci53c0NsYXNzXG4gICAgRGIud3NDbGllbnRDbGFzcyA9IHRoaXMud3NDbGllbnRDbGFzc1xuICB9XG5cbiAgaWYgKCFEYi53cykge1xuICAgIERiLndzID0gbnVsbFxuICB9XG5cbiAgcmV0dXJuIG5ldyBEYih7IC4uLnRoaXMuY29uZmlnLCBfZnJvbUFwcDogdGhpcywgLi4uZGJDb25maWcgfSlcbn1cblxuY29uc3QgY29tcG9uZW50OiBJQ2xvdWRiYXNlQ29tcG9uZW50ID0ge1xuICBuYW1lOiBDT01QT05FTlRfTkFNRSxcbiAgZW50aXR5OiB7XG4gICAgZGF0YWJhc2UsXG4gIH0sXG59XG50cnkge1xuICBjbG91ZGJhc2UucmVnaXN0ZXJDb21wb25lbnQoY29tcG9uZW50KVxufSBjYXRjaCAoZSkgeyB9XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckRhdGFiYXNlKGFwcDogSUNsb3VkYmFzZSB8IHR5cGVvZiBjbG91ZGJhc2VOUykge1xuICB0cnkge1xuICAgIGFwcC5yZWdpc3RlckNvbXBvbmVudChjb21wb25lbnQpXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLndhcm4oZSlcbiAgfVxufVxuXG50cnkge1xuICAod2luZG93IGFzIGFueSkucmVnaXN0ZXJEYXRhYmFzZSA9IHJlZ2lzdGVyRGF0YWJhc2Vcbn0gY2F0Y2ggKGUpIHt9Il19
