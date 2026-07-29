"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AcquireLockSchema = exports.LockSchema = exports.LockItemTypeSchema = void 0;
const zod_1 = require("zod");
exports.LockItemTypeSchema = zod_1.z.enum(['raw', 'finished', 'project']);
exports.LockSchema = zod_1.z.object({
    itemType: exports.LockItemTypeSchema,
    itemId: zod_1.z.string(),
    userId: zod_1.z.string().uuid(),
    userName: zod_1.z.string(),
    acquiredAt: zod_1.z.string().datetime(),
    lastHeartbeat: zod_1.z.string().datetime(),
    isIdle: zod_1.z.boolean(),
});
exports.AcquireLockSchema = zod_1.z.object({
    itemType: exports.LockItemTypeSchema,
});
//# sourceMappingURL=lock.js.map
