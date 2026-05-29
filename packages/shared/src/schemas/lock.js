"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AcquireLockSchema = exports.LockSchema = void 0;
const zod_1 = require("zod");
const movement_1 = require("./movement");
exports.LockSchema = zod_1.z.object({
    itemType: movement_1.ItemTypeSchema,
    itemId: zod_1.z.string().uuid(),
    userId: zod_1.z.string().uuid(),
    userName: zod_1.z.string(),
    acquiredAt: zod_1.z.string().datetime(),
    lastHeartbeat: zod_1.z.string().datetime(),
    isIdle: zod_1.z.boolean(),
});
exports.AcquireLockSchema = zod_1.z.object({
    itemType: movement_1.ItemTypeSchema,
});
//# sourceMappingURL=lock.js.map