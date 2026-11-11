import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request, BadRequestException, NotFoundException } from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { ExcludeRoles, PermissionsGuard, RequirePermissions, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('Geofences')
@Controller("geofences")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class GeofencesController {
  constructor(private readonly prisma: PrismaService) {}

  private validateSchemaName(schemaName: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName);
  }

  @Post()
  @RequirePermissions(Permissions.TripsDispatch)
  async createGeofence(@Body() body: { name: string, polygonWkt: string, zoneType: string }, @Request() req: any) {
    const isSqlite = (process.env.DATABASE_URL || '').startsWith('file:');
    const schemaName = req.schemaName || this.prisma.currentSchema;
    
    if (!this.validateSchemaName(schemaName)) {
      throw new BadRequestException("Invalid schema name");
    }

    if (!body.name || !body.polygonWkt || !body.zoneType) {
      throw new BadRequestException("name, polygonWkt, and zoneType are required");
    }

    if (isSqlite) {
      // SQLite keeps the raw WKT string; PostgreSQL uses a real PostGIS
      // geometry column, which Prisma cannot write through the client.
      await (this.prisma.geofence as any).create({
        data: {
          name: body.name,
          polygon: body.polygonWkt,
          zoneType: body.zoneType,
          isActive: true
        }
      });
      return { ok: true, message: "Geofence created (SQLite mode)" };
    }

    // The raw statement has to run on the request transaction: that is where
    // `app.tenant_id` is set, which is what the row-level-security policy
    // and the `tenant_id` default rely on.
    const db = this.prisma.getTenantDb();
    await db.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."geofences" (id, name, polygon, zone_type, is_active)
      VALUES (gen_random_uuid(), $1, ST_GeomFromText($2, 4326), $3, true)`,
      body.name, body.polygonWkt, body.zoneType
    );

    return { ok: true, message: "Geofence created with PostGIS" };
  }

  @Get()
  @RequirePermissions(Permissions.TripsRead)
  async listGeofences(@Request() req: any) {
    const isSqlite = (process.env.DATABASE_URL || '').startsWith('file:');
    const schemaName = req.schemaName || this.prisma.currentSchema;
    
    if (!this.validateSchemaName(schemaName)) {
      throw new BadRequestException("Invalid schema name");
    }

    if (isSqlite) {
      const fences = await this.prisma.geofence.findMany();
      return fences.map(f => ({
        id: f.id,
        name: f.name,
        polygon: { type: "Polygon", coordinates: [[[0,0],[0,1],[1,1],[1,0],[0,0]]] }, // Dummy GeoJSON for frontend render if needed, or parse WKT here
        zoneType: f.zoneType,
        isActive: f.isActive
      }));
    }

    const result: any[] = await this.prisma.tenantQuery(
      `SELECT id, name, ST_AsGeoJSON(polygon)::json as polygon, zone_type as "zoneType", is_active as "isActive"
      FROM "${schemaName}"."geofences"`
    );

    return result;
  }

  @Patch(":id")
  @RequirePermissions(Permissions.TripsDispatch)
  async updateGeofence(@Param("id") id: string, @Body() body: { name?: string, zoneType?: string, isActive?: boolean }, @Request() req: any) {
    const isSqlite = (process.env.DATABASE_URL || '').startsWith('file:');
    const schemaName = req.schemaName || this.prisma.currentSchema;
    
    if (!this.validateSchemaName(schemaName)) {
      throw new BadRequestException("Invalid schema name");
    }

    if (isSqlite) {
      await this.prisma.geofence.update({
        where: { id },
        data: {
          ...(body.name && { name: body.name }),
          ...(body.zoneType && { zoneType: body.zoneType }),
          ...(body.isActive !== undefined && { isActive: body.isActive })
        }
      });
      return { ok: true };
    }

    const result: any[] = await this.prisma.tenantQuery(
      `UPDATE "${schemaName}"."geofences" SET name = COALESCE($1, name), zone_type = COALESCE($2, zone_type), is_active = COALESCE($3, is_active) WHERE id = $4 RETURNING id`,
      body.name || null, body.zoneType || null, body.isActive ?? null, id
    );

    if (result.length === 0) {
      throw new NotFoundException("Geofence not found");
    }

    return { ok: true };
  }

  @Delete(":id")
  @RequirePermissions(Permissions.TripsDispatch)
  async deleteGeofence(@Param("id") id: string, @Request() req: any) {
    const isSqlite = (process.env.DATABASE_URL || '').startsWith('file:');
    const schemaName = req.schemaName || this.prisma.currentSchema;
    
    if (!this.validateSchemaName(schemaName)) {
      throw new BadRequestException("Invalid schema name");
    }

    if (isSqlite) {
      await this.prisma.geofence.delete({ where: { id } });
      return { ok: true };
    }

    const result: any[] = await this.prisma.tenantQuery(
      `DELETE FROM "${schemaName}"."geofences" WHERE id = $1 RETURNING id`,
      id
    );

    if (result.length === 0) {
      throw new NotFoundException("Geofence not found");
    }

    return { ok: true };
  }
}
