import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import {
  ChangeOrderStatusDto,
  CreateOrderDto,
  OrderItemDto,
  OrderPaginationDto,
  PaidOrderDto,
} from './dto/index';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { NATS_SERVICE } from 'src/config';
import { firstValueFrom } from 'rxjs';
import { OrderWithProducts } from './interfaces';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');
  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database Connected');
  }
  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {
    super();
  }

  async create(createOrderDto: CreateOrderDto) {
    try {
      // Confirmar los ids de los productos
      const productsIds = createOrderDto.items.flatMap(
        (item) => item.productId,
      );

      /*
      const products: any[] = await firstValueFrom(
        this.productsClient.send({ cmd: 'validate_products' }, productsIds),
      ); */

      const products = await this.getProductsInfo(productsIds); // TODO: Refactorización
      /*
       Calcular totales de los productos
       const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
         const price = products.find(
           (product) => product.id === orderItem.productId,
         ).price;
         return price * orderItem.quantity;
       }, 0);

       const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
         return acc + orderItem.quantity;
       }, 0); */

      // TODO: Refactorización
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + products[orderItem.productId].price * orderItem.quantity;
      }, 0);

      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0);

      // Crear transacción que impacte la base de datos
      const order = await this.order.create({
        data: {
          totalAmount,
          totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.flatMap((orderItem) => ({
                productId: orderItem.productId,
                quantity: orderItem.quantity,
                /*
                price: products.find(
                  (product) => product.id === orderItem.productId,
                ).price,
                */
                price: products[orderItem.productId].price, // TODO: Refactorización
              })),
            },
          },
        },
        include: {
          OrderItem: {
            select: { price: true, quantity: true, productId: true },
          },
        },
      });

      return {
        ...order,
        /*
        OrderItem: order.OrderItem.flatMap((orderItem) => ({
          ...orderItem,
          name: products.find((product) => product.id === orderItem.productId)
            .name,
        })),
        */
        // TODO: Refactorización
        OrderItem: await this.responseWithProductInfo(
          order.OrderItem,
          products,
        ),
      };
    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: `Check logs: ${error.message}`,
      });
    }
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const { page, limit } = orderPaginationDto;
    const totalPages = await this.order.count({
      where: {
        status: orderPaginationDto.status,
      },
    });
    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit;
    return {
      data: await this.order.findMany({
        skip: (currentPage - 1) * perPage,
        take: limit,
        where: {
          status: orderPaginationDto.status,
        },
      }),
      meta: {
        currentPage,
        page,
        perPage,
        totalPages,
      },
    };
  }

  async findOne(id: string) {
    const order = await this.order.findFirst({
      where: { id },
      include: {
        OrderItem: {
          select: { price: true, quantity: true, productId: true },
        },
      },
    });
    if (!order)
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id #${id} not found`,
      });

    // Confirmar los ids de los productos
    const productsIds = order.OrderItem.flatMap((item) => item.productId);
    const products = await this.getProductsInfo(productsIds);
    return {
      ...order,
      OrderItem: await this.responseWithProductInfo(order.OrderItem, products),
    };
  }

  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;
    const order = await this.findOne(id);
    if (order.status === status) return order;
    return this.order.update({
      where: { id },
      data: { status },
    });
  }

  async createPaymentSession(order: OrderWithProducts) {
    const paymentSession = await firstValueFrom(
      this.client.send('create.payment.session', {
        orderId: order.id,
        currency: 'usd',
        items: order.OrderItem.flatMap((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      }),
    );

    return paymentSession;
  }

  async paidOrder(paidOrderDto: PaidOrderDto) {
    await this.order.update({
      where: { id: paidOrderDto.orderId },
      data: {
        status: 'PAID',
        paid: true,
        paidAt: new Date(),
        stripeChargeId: paidOrderDto.stripePaymentId,
        OrderReceipt: {
          create: {
            receiptUrl: paidOrderDto.receiptUrl,
          },
        },
      },
    });
  }

  // Función para obtener información de productos a partir de sus IDs
  private async getProductsInfo(productsIds: number[]) {
    // Envia una solicitud al servicio de productos para validar los IDs
    const products = await firstValueFrom(
      this.client.send('validateProducts', productsIds),
    );
    // Construye un objeto que mapea IDs de productos a detalles completos de productos
    return products.reduce((acc, product) => {
      acc[product.id] = product; // Utiliza el ID del producto como clave en el objeto
      return acc;
    }, {});
  }

  // Función para enriquecer los elementos de pedido con información de productos
  private async responseWithProductInfo(
    orderItems: OrderItemDto[],
    products: any,
  ) {
    return orderItems.flatMap((orderItem) => ({
      ...orderItem,
      // Agrega el nombre del producto al elemento de pedido
      name: products[orderItem.productId].name,
    }));
  }
}
