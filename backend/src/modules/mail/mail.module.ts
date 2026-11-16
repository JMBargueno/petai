import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_SENDER, emailSenderFactory } from './email.service';

/** Envío de correos (SMTP o consola). Global: lo usan auth (recuperación) y contact. */
@Global()
@Module({
  providers: [{ provide: EMAIL_SENDER, useFactory: emailSenderFactory, inject: [ConfigService] }],
  exports: [EMAIL_SENDER],
})
export class MailModule {}
