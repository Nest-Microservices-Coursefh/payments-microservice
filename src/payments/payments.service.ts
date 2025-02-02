import { Inject, Injectable, Logger } from '@nestjs/common';
import { envs, NATS_SERVICE } from 'src/config';
import Stripe from 'stripe';
import {
  PaymentSessionDto,
  PaymentSessionItemDto,
} from './dto/payment-session.dto';
import { Request, Response } from 'express';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PaymentsService {
  private readonly stripe = new Stripe(envs.stripeSecret);
  private readonly logger = new Logger('PaymentsService');

  constructor(
    @Inject(NATS_SERVICE)
    private readonly client: ClientProxy,
  ) {}

  async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
    const { currency, items, orderId } = paymentSessionDto;

    const lineItems = items.map((item: PaymentSessionItemDto) => {
      return {
        price_data: {
          currency,
          product_data: {
            name: item.name,
          },
          unit_amount: Math.round(item.price * 100), //20 dolares = (2000/100)
        },
        quantity: item.quantity,
      };
    });

    const session = await this.stripe.checkout.sessions.create({
      payment_intent_data: {
        metadata: {
          orderId,
        },
      }, //colocar el id de la orden
      line_items: lineItems,
      mode: 'payment',
      success_url: envs.stripeSuccessUrl,
      cancel_url: envs.stripeCancelUrl,
    });

    return {
      cancelUrl: session.cancel_url,
      successUrl: session.success_url,
      url: session.url,
    };
  }

  async stripeWebhook(req: Request, res: Response) {
    const sig = req.headers['stripe-signature'];

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        req['rawBody'],
        sig,
        envs.stripeEnpointSecret,
      );
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    console.log({ event });

    switch (event.type) {
      case 'charge.succeeded':
        const chargesucceeded = event.data.object;
        const paylod = {
          stripePaymentId: chargesucceeded.id,
          orderId: chargesucceeded.metadata.orderId,
          receiptUrl: chargesucceeded.receipt_url,
        };

        // this.logger.log({ paylod });
        this.client.emit('payment.succeeded', paylod); //envio y no espero respuesta (event)
        break;

      default:
        console.log(`Evento ${event.type} not handled`);
    }

    return res.status(200).json({ sig });
  }
}
