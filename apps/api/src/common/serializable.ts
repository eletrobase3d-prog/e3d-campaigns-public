import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function serializable<T>(prisma: PrismaService, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
    } catch (error) {
      // Raw SELECT FOR UPDATE reports PostgreSQL serialization/deadlock SQLSTATE via P2010.
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || (error.code === 'P2010' &&
          ['40001', '40P01'].includes(String(error.meta?.code))));
      if (!retryable) throw error;
      if (attempt === 3) throw new ConflictException('Operação concorrente. Tente novamente.');
      await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw new ConflictException('Tente novamente.');
}
