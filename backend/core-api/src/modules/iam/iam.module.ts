import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { CoreAuthModule } from '../../core/auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { AuthService } from './auth/auth.service';
import { MfaService } from './services/mfa.service';
import { StripeService } from './payments/stripe.service';

import { HealthController } from './controllers/health.controller';
import { AuthController } from './controllers/auth.controller';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { TenantAuthController } from './controllers/tenant-auth.controller';
import { MobileAuthController } from './controllers/mobile-auth.controller';
import { ClientAuthController } from './controllers/client-auth.controller';
import { AdminTenantsController } from './controllers/admin-tenants.controller';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import { ApiKeyVerifyController } from './controllers/api-key-verify.controller';
import { TenantRolesController } from './controllers/tenant-roles.controller';
import { TenantUsersController } from './controllers/tenant-users.controller';
import { AdminAuditLogsController } from './controllers/admin-audit-logs.controller';
import { TenantSettingsController } from './controllers/tenant-settings.controller';
import { BranchesController } from './controllers/branches.controller';
import { TenantDashboardController } from './controllers/tenant-dashboard.controller';
import { TenantAuditLogsController } from './controllers/tenant-audit-logs.controller';
import { TenantBillingController } from './controllers/tenant-billing.controller';
import { AdminBillingController } from './controllers/admin-billing.controller';
import { ApiKeysController } from './controllers/api-keys.controller';
import { FeatureFlagsController } from './controllers/feature-flags.controller';
import { MetricsController } from './controllers/metrics.controller';
import { IamPortalAliasesController } from './controllers/iam-portal-aliases.controller';

/**
 * Module IAM: đăng nhập, người dùng, vai trò, tenant, billing của admin.
 * Di chuyển từ `backend/iam-service` (3B.1).
 */
@Module({
  imports: [PrismaModule, CoreAuthModule, NotificationModule],
  controllers: [
    HealthController,
    AuthController,
    AdminAuthController,
    TenantAuthController,
    MobileAuthController,
    ClientAuthController,
    AdminTenantsController,
    AdminDashboardController,
    StripeWebhookController,
    TenantRolesController,
    TenantUsersController,
    AdminAuditLogsController,
    BranchesController,
    TenantSettingsController,
    TenantDashboardController,
    TenantAuditLogsController,
    TenantBillingController,
    AdminBillingController,
    ApiKeysController,
    ApiKeyVerifyController,
    FeatureFlagsController,
    MetricsController,
    IamPortalAliasesController,
  ],
  providers: [AuthService, MfaService, StripeService],
  exports: [AuthService, MfaService, StripeService],
})
export class IamModule {}
