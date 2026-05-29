"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateUserSchema = exports.CreateUserSchema = exports.UserSchema = exports.UserRoleSchema = void 0;
const zod_1 = require("zod");
exports.UserRoleSchema = zod_1.z.enum(['admin', 'user']);
exports.UserSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1).max(100),
    role: exports.UserRoleSchema,
    avatarPath: zod_1.z.string().nullable(),
    createdAt: zod_1.z.string().datetime(),
});
exports.CreateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Naam is verplicht').max(100),
    role: exports.UserRoleSchema.default('user'),
});
exports.UpdateUserSchema = exports.CreateUserSchema.partial();
//# sourceMappingURL=user.js.map