import { z } from 'zod';
export declare const GradeSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    densityKgM3: z.ZodNumber;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    createdAt: string;
    densityKgM3: number;
}, {
    id: string;
    name: string;
    createdAt: string;
    densityKgM3: number;
}>;
export type Grade = z.infer<typeof GradeSchema>;
export declare const CreateGradeSchema: z.ZodObject<{
    name: z.ZodString;
    densityKgM3: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    name: string;
    densityKgM3: number;
}, {
    name: string;
    densityKgM3: number;
}>;
export type CreateGrade = z.infer<typeof CreateGradeSchema>;
export declare const UpdateGradeSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    densityKgM3: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    densityKgM3?: number | undefined;
}, {
    name?: string | undefined;
    densityKgM3?: number | undefined;
}>;
export type UpdateGrade = z.infer<typeof UpdateGradeSchema>;
