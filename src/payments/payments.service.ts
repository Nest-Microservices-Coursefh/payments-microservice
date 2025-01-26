import { Injectable } from '@nestjs/common';
import { envs } from 'src/config';
import Stripe from 'stripe';
import {
  PaymentSessionDto,
  PaymentSessionItemDto,
} from './dto/payment-session.dto';
import { Request, Response } from 'express';

@Injectable()
export class PaymentsService {
  private readonly stripe = new Stripe(envs.stripeSecret);
  constructor() {}

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
      success_url: 'http://localhost:3003/payments/success',
      cancel_url: 'http://localhost:30003/payments/cancel',
    });

    return session;
  }

  async stripeWebhook(req: Request, res: Response) {
    const sig = req.headers['stripe-signature'];

    let event: Stripe.Event;

    const endpoint_secret =
      'whsec_55be09d9ab7d1cbfa5d79cd425f7900070d7b9d6ada4e2e1a15e3bf443743b92';

    try {
      event = this.stripe.webhooks.constructEvent(
        req['rawBody'],
        sig,
        endpoint_secret,
      );
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    console.log({ event });

    switch (event.type) {
      case 'charge.succeeded':
        const chargesucceeded = event.data.object;
        console.log({
          metadata: chargesucceeded.metadata,
          orderId: chargesucceeded.metadata.orderId,
        });
        break;

      default:
        console.log(`Evento ${event.type} not handled`);
    }

    return res.status(200).json({ sig });
  }
}
