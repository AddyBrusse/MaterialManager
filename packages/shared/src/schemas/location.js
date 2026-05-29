"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateLocationSlotSchema = exports.UpdateLocationSchema = exports.CreateLocationSchema = exports.LocationSchema = exports.LocationSlotSchema = exports.LocationKindSchema = void 0;
const zod_1 = require("zod");
exports.LocationKindSchema = zod_1.z.enum(['rack', 'cabinet']);
exports.LocationSlotSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    locationId: zod_1.z.string().uuid(),
    level1: zod_1.z.string(),
    level2: zod_1.z.string().nullable(),
    createdAt: zod_1.z.string().datetime(),
});
exports.LocationSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    kind: exports.LocationKindSchema,
    label: zod_1.z.string(),
    createdAt: zod_1.z.string().datetime(),
    slots: zod_1.z.array(exports.LocationSlotSchema).optional(),
});
exports.CreateLocationSchema = zod_1.z.object({
    kind: exports.LocationKindSchema,
    label: zod_1.z.string().min(1, 'Label is verplicht'),
});
exports.UpdateLocationSchema = exports.CreateLocationSchema.partial();
exports.CreateLocationSlotSchema = zod_1.z.object({
    locationId: zod_1.z.string().uuid(),
    level1: zod_1.z.string().min(1),
    level2: zod_1.z.string().optional(),
});
//# sourceMappingURL=location.js.map