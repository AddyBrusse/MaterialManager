declare module 'occt-import-js' {
  interface OcctMeshAttributeArray {
    array: number[]
  }

  interface OcctMeshAttributes {
    position: OcctMeshAttributeArray
    normal?: OcctMeshAttributeArray
  }

  interface OcctMeshIndex {
    array: number[]
  }

  interface OcctBrepFace {
    first: number
    last: number
    color: [number, number, number] | null
  }

  interface OcctMesh {
    name: string
    color?: [number, number, number]
    brep_faces?: OcctBrepFace[]
    attributes: OcctMeshAttributes
    index: OcctMeshIndex
  }

  interface OcctReadResult {
    success: boolean
    meshes: OcctMesh[]
  }

  interface OcctModule {
    ReadStepFile(fileBuffer: Uint8Array, params: null): OcctReadResult
    ReadIgesFile(fileBuffer: Uint8Array, params: null): OcctReadResult
    ReadBrepFile(fileBuffer: Uint8Array, params: null): OcctReadResult
  }

  interface OcctInitOptions {
    locateFile?: (path: string) => string
  }

  export default function occtimportjs(options?: OcctInitOptions): Promise<OcctModule>
}
