import { z } from 'zod';
export declare const DimensionFieldSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    unit: z.ZodString;
}, "strip", z.ZodTypeAny, {
    label: string;
    key: string;
    unit: string;
}, {
    label: string;
    key: string;
    unit: string;
}>;
export type DimensionField = z.infer<typeof DimensionFieldSchema>;
export declare const VolumeFormulaSchema: z.ZodEnum<["round", "square", "flat", "tube"]>;
export type VolumeFormula = z.infer<typeof VolumeFormulaSchema>;
export declare const ProfileSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    dimensionSchema: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        unit: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        label: string;
        key: string;
        unit: string;
    }, {
        label: string;
        key: string;
        unit: string;
    }>, "many">;
    volumeFormula: z.ZodEnum<["round", "square", "flat", "tube"]>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    createdAt: string;
    dimensionSchema: {
        label: string;
        key: string;
        unit: string;
    }[];
    volumeFormula: "flat" | "round" | "square" | "tube";
}, {
    id: string;
    name: string;
    createdAt: string;
    dimensionSchema: {
        label: string;
        key: string;
        unit: string;
    }[];
    volumeFormula: "flat" | "round" | "square" | "tube";
}>;
export type Profile = z.infer<typeof ProfileSchema>;
export declare const CreateProfileSchema: z.ZodObject<{
    name: z.ZodString;
    dimensionSchema: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        unit: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        label: string;
        key: string;
        unit: string;
    }, {
        label: string;
        key: string;
        unit: string;
    }>, "many">;
    volumeFormula: z.ZodEnum<["round", "square", "flat", "tube"]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    dimensionSchema: {
        label: string;
        key: string;
        unit: string;
    }[];
    volumeFormula: "flat" | "round" | "square" | "tube";
}, {
    name: string;
    dimensionSchema: {
        label: string;
        key: string;
        unit: string;
    }[];
    volumeFormula: "flat" | "round" | "square" | "tube";
}>;
export type CreateProfile = z.infer<typeof CreateProfileSchema>;
export declare const UpdateProfileSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    dimensionSchema: z.ZodOptional<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        unit: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        label: string;
        key: string;
        unit: string;
    }, {
        label: string;
        key: string;
        unit: string;
    }>, "many">>;
    volumeFormula: z.ZodOptional<z.ZodEnum<["round", "square", "flat", "tube"]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    dimensionSchema?: {
        label: string;
        key: string;
        unit: string;
    }[] | undefined;
    volumeFormula?: "flat" | "round" | "square" | "tube" | undefined;
}, {
    name?: string | undefined;
    dimensionSchema?: {
        label: string;
        key: string;
        unit: string;
    }[] | undefined;
    volumeFormula?: "flat" | "round" | "square" | "tube" | undefined;
}>;
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;
