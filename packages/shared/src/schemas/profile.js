"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateProfileSchema = exports.CreateProfileSchema = exports.ProfileSchema = exports.VolumeFormulaSchema = exports.DimensionFieldSchema = void 0;
const zod_1 = require("zod");
exports.DimensionFieldSchema = zod_1.z.object({
    key: zod_1.z.string(),
    label: zod_1.z.string(),
    unit: zod_1.z.string(),
});
exports.VolumeFormulaSchema = zod_1.z.enum(['round', 'square', 'flat', 'tube']);
exports.ProfileSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string(),
    dimensionSchema: zod_1.z.array(exports.DimensionFieldSchema),
    volumeFormula: exports.VolumeFormulaSchema,
    createdAt: zod_1.z.string().datetime(),
});
exports.CreateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Naam is verplicht'),
    dimensionSchema: zod_1.z.array(exports.DimensionFieldSchema).min(1),
    volumeFormula: exports.VolumeFormulaSchema,
});
exports.UpdateProfileSchema = exports.CreateProfileSchema.partial();
//# sourceMappingURL=profile.js.map