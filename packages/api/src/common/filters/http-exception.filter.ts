import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        message = (res as any).message || message;
        error = (res as any).error || error;
      }
    } else if (exception instanceof Error) {
      // Handle Prisma errors
      if (exception.constructor.name === 'PrismaClientKnownRequestError') {
        const prismaError = exception as any;
        if (prismaError.code === 'P2025') {
          status = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          error = 'Not Found';
        } else if (prismaError.code === 'P2002') {
          status = HttpStatus.CONFLICT;
          message = 'Record already exists';
          error = 'Conflict';
        }
      }
      if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
      }
    }

    response.status(status).send({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
