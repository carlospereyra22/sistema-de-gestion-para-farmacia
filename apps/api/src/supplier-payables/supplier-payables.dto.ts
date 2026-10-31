import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { documentTypes } from "./payable-rules";
import { paymentMethods } from "./payment-rules";
export class PaySupplierDto {
  @IsUUID() operationId!: string;
  @IsString() @Matches(/^\d{1,14}$/) amountMinor!: string;
  @IsString() @Matches(/^\d{1,14}$/) expectedBalanceMinor!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) paidOn!: string;
  @IsIn(paymentMethods) method!: string;
  @IsOptional() @IsString() @MaxLength(160) reference?: string;
}
export class VoidSupplierPaymentDto {
  @IsString() @MaxLength(300) reason!: string;
}
class DueDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dueOn!: string | null;
  @IsString() @Matches(/^\d{1,14}$/) amountMinor!: string;
}
export class PayableQueryDto {
  @IsOptional()
  @IsIn(["ALL", "OPEN", "PENDING", "PARTIAL", "PAID"])
  payment?: string;
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsString() @MaxLength(36) supplierId?: string;
  @IsOptional()
  @IsIn(["ALL", "OVERDUE", "TODAY", "NEXT7", "NEXT30", "UNDATED"])
  due?: string;
  @IsOptional() @Matches(/^[1-9]\d{0,8}$/) page?: string;
}
export class NewPayableDto {
  @IsUUID() operationId!: string;
  @IsUUID() supplierId!: string;
  @IsOptional() @IsUUID() purchaseId?: string;
  @IsIn(documentTypes) documentType!: string;
  @IsString() @MaxLength(5) pointOfSale!: string;
  @IsString() @MaxLength(60) documentNumber!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) issuedOn!: string;
  @IsString() @Matches(/^\d{1,14}$/) amountMinor!: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(36)
  @ValidateNested({ each: true })
  @Type(() => DueDto)
  dues!: DueDto[];
}
