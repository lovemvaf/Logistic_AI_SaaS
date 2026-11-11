export type LoginRequest = {
  email: string
  password: string
}

export type LoginResponse = {
  ok: boolean
  accessToken?: string
  message?: string
  user?: {
    id: string
    email: string
    role: string
    tenantId: string | null
    permissions?: string[]
    warehouseIds?: string[]
    branchIds?: string[]
    hubId?: string
    schemaName?: string
  }
}
