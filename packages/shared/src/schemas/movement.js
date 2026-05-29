"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateMovementSchema = exports.StockMovementSchema = exports.MovementReasonSchema = exports.MovementKindSchema = exports.ItemTypeSchema = void 0;
const zod_1 = require("zod");
exports.ItemTypeSchema = zod_1.z.enum(['raw', 'finished']);
exports.MovementKindSchema = zod_1.z.enum(['delta', 'overwrite']);
exports.MovementReasonSchema = zod_1.z.enum(['received', 'used', 'scrapped', 'correction', 'other']);
exports.StockMovementSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    itemType: exports.ItemTypeSchema,
    itemId: zod_1.z.string().uuid(),
    userId: zod_1.z.string().uuid(),
    kind: exports.MovementKindSchema,
    amount: zod_1.z.number(),
    previousStock: zod_1.z.number(),
    newStock: zod_1.z.number(),
    reason: exports.MovementReasonSchema,
    note: zod_1.z.string().nullable(),
    createdAt: zod_1.z.string().datetime(),
});
exports.CreateMovementSchema = zod_1.z.object({
    itemType: exports.ItemTypeSchema,
    itemId: zod_1.z.string().uuid(),
    kind: exports.MovementKindSchema,
    amount: zod_1.z.number(),
    reason: exports.MovementReasonSchema,
    note: zod_1.z.string().optional(),
});
//# sourceMappingURL=movement.js.map