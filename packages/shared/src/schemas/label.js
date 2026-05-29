"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsumeLabelSchema = exports.LabelSchema = exports.LabelStatusSchema = void 0;
const zod_1 = require("zod");
exports.LabelStatusSchema = zod_1.z.enum(['printed_unused', 'consumed', 'voided']);
exports.LabelSchema = zod_1.z.object({
    number: zod_1.z.string().regex(/^#\d{5}$/),
    batchId: zod_1.z.string().uuid(),
    status: exports.LabelStatusSchema,
    printedAt: zod_1.z.string().datetime(),
    printedById: zod_1.z.string().uuid(),
    consumedAt: zod_1.z.string().datetime().nullable(),
    consumedRawMaterialId: zod_1.z.string().uuid().nullable(),
});
exports.ConsumeLabelSchema = zod_1.z.object({
    rawMaterialId: zod_1.z.string().uuid(),
});
//# sourceMappingURL=label.js.map