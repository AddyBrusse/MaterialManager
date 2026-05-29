"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateFinishedGoodSchema = exports.CreateFinishedGoodSchema = exports.FinishedGoodSchema = void 0;
const zod_1 = require("zod");
exports.FinishedGoodSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    artNo: zod_1.z.string().regex(/^ART-\d{4}$/, 'Artikelnummer moet ART-NNNN formaat hebben'),
    name: zod_1.z.string(),
    customer: zod_1.z.string().nullable(),
    photoPath: zod_1.z.string().nullable(),
    drawingPath: zod_1.z.string().nullable(),
    locationSlotId: zod_1.z.string().uuid().nullable(),
    minStock: zod_1.z.number().nonnegative().nullable(),
    currentStock: zod_1.z.number(),
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
});
exports.CreateFinishedGoodSchema = zod_1.z.object({
    artNo: zod_1.z.string().regex(/^ART-\d{4}$/, 'Artikelnummer moet ART-NNNN formaat hebben'),
    name: zod_1.z.string().min(1, 'Naam is verplicht'),
    customer: zod_1.z.string().optional(),
    locationSlotId: zod_1.z.string().uuid().optional(),
    minStock: zod_1.z.number().nonnegative().optional(),
});
exports.UpdateFinishedGoodSchema = exports.CreateFinishedGoodSchema.omit({ artNo: true }).partial();
//# sourceMappingURL=finished-good.js.map