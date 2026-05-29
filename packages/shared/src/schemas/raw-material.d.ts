import { z } from 'zod';
export declare const RawMaterialSchema: z.ZodObject<{
    id: z.ZodString;
    code: z.ZodString;
    gradeId: z.ZodString;
    profileId: z.ZodString;
    dimensions: z.ZodRecord<z.ZodString, z.ZodNumber>;
    lengthMm: z.ZodNumber;
    locationSlotId: z.ZodNullable<z.ZodString>;
    photoPath: z.ZodNullable<z.ZodString>;
    minStock: z.ZodNullable<z.ZodNumber>;
    currentStock: z.ZodNumber;
    weightKg: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    id: string;
    createdAt: string;
    gradeId: string;
    profileId: string;
    dimensions: Record<string, number>;
    lengthMm: number;
    locationSlotId: string | null;
    photoPath: string | null;
    minStock: number | null;
    currentStock: number;
    updatedAt: string;
    weightKg?: number | undefined;
}, {
    code: string;
    id: string;
    createdAt: string;
    gradeId: string;
    profileId: string;
    dimensions: Record<string, number>;
    lengthMm: number;
    locationSlotId: string | null;
    photoPath: string | null;
    minStock: number | null;
    currentStock: number;
    updatedAt: string;
    weightKg?: number | undefined;
}>;
export type RawMaterial = z.infer<typeof RawMaterialSchema>;
export declare const CreateRawMaterialSchema: z.ZodObject<{
    code: z.ZodString;
    gradeId: z.ZodString;
    profileId: z.ZodString;
    dimensions: z.ZodRecord<z.ZodString, z.ZodNumber>;
    lengthMm: z.ZodNumber;
    locationSlotId: z.ZodOptional<z.ZodString>;
    minStock: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    code: string;
    gradeId: string;
    profileId: string;
    dimensions: Record<string, number>;
    lengthMm: number;
    locationSlotId?: string | undefined;
    minStock?: number | undefined;
}, {
    code: string;
    gradeId: string;
    profileId: string;
    dimensions: Record<string, number>;
    lengthMm: number;
    locationSlotId?: string | undefined;
    minStock?: number | undefined;
}>;
export type CreateRawMaterial = z.infer<typeof CreateRawMaterialSchema>;
export declare const UpdateRawMaterialSchema: z.ZodObject<{
    gradeId: z.ZodOptional<z.ZodString>;
    profileId: z.ZodOptional<z.ZodString>;
    dimensions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    lengthMm: z.ZodOptional<z.ZodNumber>;
    locationSlotId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    minStock: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    gradeId?: string | undefined;
    profileId?: string | undefined;
    dimensions?: Record<string, number> | undefined;
    lengthMm?: number | undefined;
    locationSlotId?: string | undefined;
    minStock?: number | undefined;
}, {
    gradeId?: string | undefined;
    profileId?: string | undefined;
    dimensions?: Record<string, number> | undefined;
    lengthMm?: number | undefined;
    locationSlotId?: string | undefined;
    minStock?: number | undefined;
}>;
export type UpdateRawMaterial = z.infer<typeof UpdateRawMaterialSchema>;
