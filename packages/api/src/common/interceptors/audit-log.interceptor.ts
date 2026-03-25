import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';

export const AUDIT_ACTION_KEY = 'auditAction';

export interface AuditActionMeta {
  action: string;
  entityType?: string;
}

/**
 * Decorator to mark controller methods for audit logging.
 * Usage: @AuditAction({ action: 'connector.created', entityType: 'ConnectorConfig' })
 */
export function AuditAction(meta: AuditActionMeta): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    Reflect.defineMetadata(AUDIT_ACTION_KEY, meta, descriptor.value!);
    return descriptor;
  };
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<AuditActionMeta>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.userId) {
      return next.handle();
    }

    const projectId = request.params?.projectId ?? null;
    const entityId = request.params?.id ?? null;

    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          await this.prisma.auditLog.create({
            data: {
              userId: user.userId,
              projectId,
              action: meta.action,
              entityType: meta.entityType ?? null,
              entityId,
              newValue: responseData != null ? JSON.parse(JSON.stringify(responseData)) : null,
            },
          });
        } catch {
          // Audit logging should never break the request
        }
      }),
    );
  }
}
