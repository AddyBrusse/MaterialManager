"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateGradeSchema = exports.CreateGradeSchema = exports.GradeSchema = void 0;
const zod_1 = require("zod");
exports.GradeSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string(),
    densityKgM3: zod_1.z.number().positive(),
    createdAt: zod_1.z.string().datetime(),
});
exports.CreateGradeSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Naam is verplicht'),
    densityKgM3: zod_1.z.number().positive('Dichtheid moet positief zijn'),
});
exports.UpdateGradeSchema = exports.CreateGradeSchema.partial();
//# sourceMappingURL=grade.js.map