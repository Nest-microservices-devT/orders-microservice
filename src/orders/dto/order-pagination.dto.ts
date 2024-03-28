import { IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { PaginationDto } from 'src/common';
import { OrderStatusList } from '../enum';

export class OrderPaginationDto extends PaginationDto {
  @IsEnum(OrderStatusList, {
    message: `Possible status values are ${OrderStatusList}`,
  })
  status: OrderStatus;
}
