"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateRawMaterialSchema = exports.CreateRawMaterialSchema = exports.RawMaterialSchema = void 0;
const zod_1 = require("zod");
exports.RawMaterialSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    code: zod_1.z.string().regex(/^#\d{5}$/, 'Code moet #NNNNN formaat hebben'),
    gradeId: zod_1.z.string().uuid(),
    profileId: zod_1.z.string().uuid(),
    dimensions: zod_1.z.record(zod_1.z.number()),
    lengthMm: zod_1.z.number().positive(),
    locationSlotId: zod_1.z.string().uuid().nullable(),
    photoPath: zod_1.z.string().nullable(),
    minStock: zod_1.z.number().nonnegative().nullable(),
    currentStock: zod_1.z.number(),
    weightKg: zod_1.z.number().optional(),
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
});
exports.CreateRawMaterialSchema = zod_1.z.object({
    code: zod_1.z.string().regex(/^#\d{5}$/, 'Code moet #NNNNN formaat hebben'),
    gradeId: zod_1.z.string().uuid(),
    profileId: zod_1.z.string().uuid(),
    dimensions: zod_1.z.record(zod_1.z.number()),
    lengthMm: zod_1.z.number().positive('Lengte moet positief zijn'),
    locationSlotId: zod_1.z.string().uuid().optional(),
    minStock: zod_1.z.number().nonnegative().optional(),
});
exports.UpdateRawMaterialSchema = exports.CreateRawMaterialSchema.omit({ code: true }).partial();
//# sourceMappingURL=raw-material.js.map