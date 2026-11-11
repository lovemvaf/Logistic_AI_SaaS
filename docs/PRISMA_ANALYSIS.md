# Prisma Initialization and Usage Analysis

## Summary
The codebase has **critical configuration mismatches** between Prisma schema configuration, Docker setup, and service implementations that would prevent the Prisma client from working correctly.

---

## 1. Current Prisma Setup

### Prisma Schema Configuration
**File**: [packages/prisma-schemas/prisma/schema.prisma](packages/prisma-schemas/prisma/schema.prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

**Critical Issue**: Schema is configured for **SQLite**, but production uses **PostgreSQL**.

### Prisma Version
- **Version**: 5.18.0 (`@prisma/client` and `prisma` in all services)
- **Location**: [packages/prisma-schemas/package.json](packages/prisma-schemas/package.json)

---

## 2. PrismaModule Initialization Files

### A. Services with Correct Tenant Isolation (REQUEST Scope)

#### ✅ customer-api
**Files**:
- [services/customer-api/src/prisma/prisma.module.ts](services/customer-api/src/prisma/prisma.module.ts)
- [services/customer-api/src/prisma/prisma.service.ts](services/customer-api/src/prisma/prisma.service.ts)

```typescript
@Injectable({ scope: Scope.REQUEST })
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(REQUEST) private readonly request: any) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  public get tenantClient(): any {
    const schemaName = this.request?.schemaName || 'public';
    const self = this as any;
    return self.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }: any) {
            return self.$transaction(async (tx: any) => {
              await tx.$executeRawUnsafe(`SET search_path TO "${schemaName}", public`);
              return query(args);
            });
          },
        },
      },
    });
  }
}
```

**Strengths**:
- ✅ Uses REQUEST scope for per-request isolation
- ✅ Injects REQUEST context to access `schemaName` from middleware
- ✅ Implements proper tenant isolation via `$extends` and schema switching
- ✅ Tenant middleware properly resolves `dbSchemaName` from database

#### ✅ notification-service
**Same implementation as customer-api** with REQUEST scope and proper tenant isolation

---

### B. Services with BROKEN Tenant Isolation (Global Scope)

#### ❌ inventory-service
**Files**:
- [services/inventory-service/src/prisma/prisma.module.ts](services/inventory-service/src/prisma/prisma.module.ts)
- [services/inventory-service/src/prisma/prisma.service.ts](services/inventory-service/src/prisma/prisma.service.ts)

```typescript
@Injectable()  // ❌ GLOBAL SCOPE (DEFAULT) - WRONG!
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();  // ❌ No REQUEST injection
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  public get tenantClient(): any {
    // ❌ NO TENANT ISOLATION - RETURNS GLOBAL CLIENT!
    return this;
  }
}
```

**Tenant Middleware**: [services/inventory-service/src/middleware/tenant.middleware.ts](services/inventory-service/src/middleware/tenant.middleware.ts)
- ✅ Properly resolves tenant schema from database
- ✅ Correctly sets `req.schemaName` on the request object
- ❌ But PrismaService has **no way to access** `req.schemaName` because it's not injected!

**Controllers using this**:
- [services/inventory-service/src/controllers/orders.controller.ts](services/inventory-service/src/controllers/orders.controller.ts)
- [services/inventory-service/src/controllers/inventory.controller.ts](services/inventory-service/src/controllers/inventory.controller.ts)
- [services/inventory-service/src/warehouses/warehouses.controller.ts](services/inventory-service/src/warehouses/warehouses.controller.ts)
- [services/inventory-service/src/locations/locations.controller.ts](services/inventory-service/src/locations/locations.controller.ts)
- [services/inventory-service/src/tasks/tasks.controller.ts](services/inventory-service/src/tasks/tasks.controller.ts)
- [services/inventory-service/src/waves/waves.service.ts](services/inventory-service/src/waves/waves.service.ts)
- [services/inventory-service/src/middleware/tenant.middleware.ts](services/inventory-service/src/middleware/tenant.middleware.ts)

#### ❌ order-service
**Files**:
- [services/order-service/src/prisma/prisma.module.ts](services/order-service/src/prisma/prisma.module.ts)
- [services/order-service/src/prisma/prisma.service.ts](services/order-service/src/prisma/prisma.service.ts)

**Same broken implementation as inventory-service** (Global scope, no tenant isolation)

**Example Usage** in [services/order-service/src/controllers/orders.controller.ts](services/order-service/src/controllers/orders.controller.ts):

```typescript
@Controller("orders")
export class OrdersController implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka
  ) {}

  @Get()
  @RequirePermissions(Permissions.OrdersRead)
  async listOrders() {
    // ❌ Line 75 - Calling on global client without tenant isolation!
    return this.prisma.tenantClient.order.findMany({ include: { items: true } });
  }

  async createOrder(@Body() body: any) {
    return await this.prisma.tenantClient.$transaction(async (tx: any) => {
      // ❌ This will execute on the GLOBAL client, mixing tenant data!
      const order = await tx.order.create({
        data: {
          trackingCode,
          clientId: body.clientId,
          // ... rest of data
        }
      });
      return order;
    });
  }
}
```

**Tenant Middleware**: [services/order-service/src/middleware/tenant.middleware.ts](services/order-service/src/middleware/tenant.middleware.ts)

```typescript
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] || 'demo-tenant-id';

    (req as any).tenantId = tenantId;
    // ❌ HARDCODED! Doesn't look up actual schema name from database!
    (req as any).schemaName = 'tenant';

    next();
  }
}
```

**Critical Problems**:
1. ❌ Hardcodes `schemaName = 'tenant'` instead of looking up actual schema
2. ❌ PrismaService can't access request context
3. ❌ `tenantClient` getter returns unmodified global client
4. ❌ All tenant data goes to default schema

#### ❌ logistics-service
**Files**:
- [services/logistics-service/src/prisma/prisma.module.ts](services/logistics-service/src/prisma/prisma.module.ts)
- [services/logistics-service/src/prisma/prisma.service.ts](services/logistics-service/src/prisma/prisma.service.ts)

**Same broken implementation as inventory-service and order-service**

**Tenant Middleware**: [services/logistics-service/src/middleware/tenant.middleware.ts](services/logistics-service/src/middleware/tenant.middleware.ts)
- ✅ Correctly looks up tenant and schema from database (like inventory-service)
- ❌ But PrismaService still can't use it (global scope, no request injection)

#### ❌ iam-service
**Files**:
- [services/iam-service/src/prisma/prisma.module.ts](services/iam-service/src/prisma/prisma.module.ts)
- [services/iam-service/src/prisma/prisma.service.ts](services/iam-service/src/prisma/prisma.service.ts)

**Same broken implementation as other services**

**Tenant Middleware**: [services/iam-service/src/middleware/tenant.middleware.ts](services/iam-service/src/middleware/tenant.middleware.ts)
- ✅ Correctly looks up tenant and schema from database
- ❌ But PrismaService still broken

---

## 3. Client Injection Pattern Comparison

### Correct Pattern (customer-api, notification-service)
```typescript
@Controller()
export class MyController {
  constructor(private readonly prisma: PrismaService) {}

  async myMethod() {
    // PrismaService has access to REQUEST context
    // This properly resolves to correct tenant schema
    return this.prisma.tenantClient.order.findMany();
  }
}
```

**How it works**:
1. Middleware sets `req.schemaName = 'tenant_abc123'`
2. REQUEST scope means PrismaService gets injected per-request
3. PrismaService constructor receives REQUEST, accesses `req.schemaName`
4. `tenantClient` uses `$extends` to switch schema before executing query
5. Query runs on correct tenant schema

### Broken Pattern (inventory-service, order-service, logistics-service, iam-service)
```typescript
@Controller()
export class MyController {
  constructor(private readonly prisma: PrismaService) {}

  async myMethod() {
    // PrismaService has NO access to REQUEST context
    // tenantClient.order.findMany() is just calling this.order.findMany()
    // ❌ Query runs on DEFAULT or WRONG schema!
    return this.prisma.tenantClient.order.findMany();
  }
}
```

**Why it fails**:
1. Middleware sets `req.schemaName = 'tenant_abc123'`
2. **GLOBAL scope** means PrismaService is a singleton
3. PrismaService constructor never receives REQUEST
4. `req.schemaName` is inaccessible to the service
5. `tenantClient` getter returns unmodified `this`
6. Query runs on global/default connection without schema switching

---

## 4. Environment Configuration Issues

### Docker Compose (Production)
**File**: [docker-compose.yml](docker-compose.yml)

```yaml
postgres:
  image: postgis/postgis:15-3.3
  environment:
    POSTGRES_USER: root
    POSTGRES_PASSWORD: password
    POSTGRES_DB: smartlogi

services:
  iam-service:
    environment:
      - DATABASE_URL=postgresql://root:password@postgres:5432/smartlogi

  inventory-service:
    environment:
      - DATABASE_URL=postgresql://root:password@postgres:5432/smartlogi

  order-service:
    environment:
      - DATABASE_URL=postgresql://root:password@postgres:5432/smartlogi

  logistics-service:
    environment:
      - DATABASE_URL=postgresql://root:password@postgres:5432/smartlogi
```

### Dockerfile and Development
**File**: [Dockerfile.hf](Dockerfile.hf)
```bash
ENV DATABASE_URL="file:/app/dev.db"
```

**File**: [hf-supervisord.conf](hf-supervisord.conf)
```bash
environment=DATABASE_URL="file:/app/dev.db"
```

### ❌ CRITICAL MISMATCH
| Setting | Prisma Schema | Docker | Dockerfile | Development |
|---------|---------------|--------|------------|-------------|
| Provider | **sqlite** | PostgreSQL | SQLite | SQLite |
| URL | `env("DATABASE_URL")` | `postgresql://...` | `file:/app/dev.db` | `file:/app/dev.db` |

**Impact**: Prisma client will fail to connect or use wrong database

---

## 5. Dependency Injection & Module Configuration

### PrismaModule Structure (All Services)
```typescript
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

✅ **Correctly marked as @Global()** - PrismaModule is available everywhere
❌ **But PrismaService doesn't use REQUEST scope** (except customer-api/notification-service)

### App Module Imports (Example: inventory-service)
**File**: [services/inventory-service/src/app.module.ts](services/inventory-service/src/app.module.ts)

```typescript
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [/* ... */],
  providers: [Reflector, InventoryService, WavesService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
```

⚠️ **Middleware registered AFTER module imports** - PrismaService already instantiated as singleton

---

## 6. Issues Found

### 🔴 CRITICAL Issues

1. **Database Provider Mismatch** (Will cause immediate failure)
   - Prisma schema: `sqlite`
   - Production environment: `postgresql://...`
   - Prisma generates client code specific to the provider
   - **Result**: `Error: the database system does not match the `provider` specified in your schema` or connection will fail silently

2. **Tenant Isolation Not Implemented** (Data breach risk)
   - Four services (inventory, order, logistics, iam) use global PrismaService
   - `tenantClient` getter returns unmodified global client
   - All queries ignore tenant context
   - **Result**: Cross-tenant data access, all users see all data

3. **Request Context Inaccessible** (Can't implement multi-tenancy)
   - Services don't inject REQUEST in PrismaService constructor
   - Even though middleware sets `req.schemaName`, PrismaService can't access it
   - **Result**: Schema switching logic cannot work

4. **Order Service Middleware Hardcoded** (Ignores actual tenant)
   - Hardcodes `schemaName = 'tenant'`
   - Doesn't look up actual tenant from database
   - **Result**: All orders go to hardcoded 'tenant' schema, not customer's actual schema

### 🟡 WARNING Issues

5. **Scope Mismatch Between Middleware and Service**
   - Middleware is NestMiddleware (runs per request)
   - But PrismaService is global scope (singleton)
   - Middleware data never reaches service
   - **Result**: Tenant isolation middleware is wasted effort

6. **Connection Pool Exhaustion**
   - Global PrismaService means single connection pool for all requests
   - High concurrency will exhaust connections quickly
   - **Result**: Timeout errors under load

7. **No Error Handling in PrismaService**
   - No error recovery or connection retry logic
   - **Result**: Service crashes on DB connection issues

---

## 7. Prisma Client Usage Pattern

### How It Should Work (customer-api)
```typescript
// Controller injects PrismaService with REQUEST scope
constructor(private readonly prisma: PrismaService) {}

// Each method uses tenantClient which respects tenant schema
async listOrders() {
  // prisma.tenantClient properly switches to req.schemaName before querying
  return this.prisma.tenantClient.order.findMany();
}
```

### How It Actually Works (inventory-service)
```typescript
// Controller injects PrismaService with GLOBAL scope
constructor(private readonly prisma: PrismaService) {}

// Method calls tenantClient which is broken
async listOrders() {
  // prisma.tenantClient.order is just prisma.order (returns this)
  // No schema switching occurs
  // Query uses global default schema
  return this.prisma.tenantClient.order.findMany();
}
```

---

## 8. Line-by-Line Failure Points

### Exact Error Locations

**File**: [services/order-service/src/controllers/orders.controller.ts](services/order-service/src/controllers/orders.controller.ts)
```typescript
Line 75:  async listOrders() {
          return this.prisma.tenantClient.order.findMany();
          // ❌ FAILS: tenantClient returns unmodified global client
          //           No tenant isolation, wrong schema accessed
          //           Query tries to access 'order' table in default schema
          //           If schema is 'tenant' but this is in 'public' -> NOT FOUND
          //           Error: "relation \"order\" does not exist"
          // ❌ FAILS: If database is SQLite but config is PostgreSQL
          //           Error: "provider specified in schema does not match database"
}
```

**File**: [services/inventory-service/src/controllers/orders.controller.ts](services/inventory-service/src/controllers/orders.controller.ts)
```typescript
Line 37:  async createOrder(@Body() body: any) {
          return await this.prisma.tenantClient.$transaction(async (tx: any) => {
            const order = await tx.order.create({
              data: { trackingCode, clientId, /* ... */ }
            });
            // ❌ FAILS: Same issues as above
            //           Transaction is on global client, no tenant context
            //           Order created in wrong schema or not created at all
}
```

**File**: [services/order-service/src/middleware/tenant.middleware.ts](services/order-service/src/middleware/tenant.middleware.ts)
```typescript
Line 11:  (req as any).schemaName = 'tenant';
          // ❌ Hardcoded instead of looking up real schema from database
          // ❌ PrismaService has no way to access this anyway (global scope)
```

---

## 9. Recommended Fixes

### Priority 1: Fix Database Provider
```prisma
// Change FROM:
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// Change TO:
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Then regenerate Prisma client:
```bash
pnpm exec prisma generate
```

### Priority 2: Fix inventory-service PrismaService
Change from global to REQUEST scope and inject REQUEST:

```typescript
import { Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

@Injectable({ scope: Scope.REQUEST })
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(REQUEST) private readonly request: any) {
    super();
  }

  // Copy tenant isolation logic from customer-api
  public get tenantClient(): any {
    const schemaName = this.request?.schemaName || 'public';
    const self = this as any;
    return self.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }: any) {
            return self.$transaction(async (tx: any) => {
              await tx.$executeRawUnsafe(`SET search_path TO "${schemaName}", public`);
              return query(args);
            });
          },
        },
      },
    });
  }
}
```

### Priority 3: Fix order-service Middleware
```typescript
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request | any, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] || req.user?.tenant_id;

    if (!tenantId) {
      req.schemaName = 'public';
      return next();
    }

    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId as string },
      });

      if (!tenant) {
        throw new UnauthorizedException('Tenant not found');
      }

      req.tenantId = tenant.id;
      req.schemaName = tenant.dbSchemaName;  // Use actual schema from DB
      next();
    } catch (error) {
      next(error);
    }
  }
}
```

### Priority 4: Repeat Fixes for logistics-service and iam-service
Apply the same changes as inventory-service

---

## Summary Table

| Service | Scope | Request Injection | Tenant Isolation | Middleware Quality | Status |
|---------|-------|-------------------|------------------|-------------------|--------|
| **customer-api** | REQUEST ✅ | Yes ✅ | Yes ✅ | Proper ✅ | **WORKS** |
| **notification-service** | REQUEST ✅ | Yes ✅ | Yes ✅ | Proper ✅ | **WORKS** |
| **inventory-service** | Global ❌ | No ❌ | No ❌ | Proper ✅ | **BROKEN** |
| **order-service** | Global ❌ | No ❌ | No ❌ | Hardcoded ❌ | **BROKEN** |
| **logistics-service** | Global ❌ | No ❌ | No ❌ | Proper ✅ | **BROKEN** |
| **iam-service** | Global ❌ | No ❌ | No ❌ | Proper ✅ | **BROKEN** |

---

## Prisma Schema Analysis

**File**: [packages/prisma-schemas/prisma/schema.prisma](packages/prisma-schemas/prisma/schema.prisma)

The schema defines **25+ data models** including:
- **System Level**: Tenant, SubscriptionPlan, SystemAdmin, SystemAuditLog
- **Multi-Tenant**: TenantUser, CustomRole, Branch, Warehouse, Zone, Rack, Bin
- **Inventory**: Product, Inventory, StockMovement, CycleCount, Adjustment
- **Orders**: Client, ClientUser, Order, OrderItem, OrderTrackingEvent
- **Logistics**: Vehicle, Driver, Trip, TripStop, Delivery, GpsTrackingLog
- **AI**: AiModel, AiFeedback

All models are correctly defined for multi-tenancy, but the implementation doesn't use them correctly due to the issues above.
