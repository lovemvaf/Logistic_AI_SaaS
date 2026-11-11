export interface JwtPayload {
  sub: string
  email: string
  role: string
  tenant_id?: string
  schema_name?: string
  warehouse_ids?: string[]
  branch_ids?: string[]
  hub_id?: string
  permissions: string[]
}
