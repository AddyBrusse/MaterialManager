import { z } from 'zod';
export declare const UserRoleSchema: z.ZodEnum<["admin", "user"]>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    role: z.ZodEnum<["admin", "user"]>;
    avatarPath: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    role: "admin" | "user";
    avatarPath: string | null;
    createdAt: string;
}, {
    id: string;
    name: string;
    role: "admin" | "user";
    avatarPath: string | null;
    createdAt: string;
}>;
export type User = z.infer<typeof UserSchema>;
export declare const CreateUserSchema: z.ZodObject<{
    name: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<["admin", "user"]>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    role: "admin" | "user";
}, {
    name: string;
    role?: "admin" | "user" | undefined;
}>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export declare const UpdateUserSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodDefault<z.ZodEnum<["admin", "user"]>>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    role?: "admin" | "user" | undefined;
}, {
    name?: string | undefined;
    role?: "admin" | "user" | undefined;
}>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
