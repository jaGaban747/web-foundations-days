# TicketHub Design

## 1. Requirements

**Functional:** register and log in, browse events, view a seat map, hold up to 4 seats for 5 minutes, pay, view my tickets.

**Non functional:** correctness (no seat sold twice), fairness (a fair order in a big sale), speed (browsing under 200 ms), availability during the sale, scalability (bursts of 575 times normal), durability (paid orders kept), security (HTTPS, no card data stored).

## 2. Estimates

* **Normal day:** 500,000 views, about 6 per second (29 at peak). 5,000 tickets, about 0.06 per second.
* **Big sale:** 200,000 people in 600 seconds is about 333 arrivals per second. About 10 requests each gives 3,300 requests per second (10,000 in the first minute) and 33 sales per second.
* **Comparison:** about 575 times normal traffic. Demand is 10 times supply, so 90 percent miss out.

## 3. API

* `GET /api/v1/events`: list events (200)
* `GET /api/v1/events/{id}/seats`: seat map (200)
* `POST /api/v1/events/{id}/holds`: hold seats (201, 409 if taken)
* `DELETE /api/v1/holds/{id}`: release a hold (204)
* `POST /api/v1/orders`: pay with a hold id (201, 410 expired, 402 payment failed)
* `GET /api/v1/me/tickets`: my tickets (200)

## 4. Data model

* **users:** id (primary key), name, email (unique)
* **events:** id (primary key), name, venue, starts_at
* **seats:** id (primary key), event_id (foreign key), section, seat_number, status, hold_id, held_by (foreign key), hold_expires_at
* **orders:** id (primary key), user_id (foreign key), idempotency_key (unique)
* **tickets:** id (primary key), order_id (foreign key), seat_id (foreign key, unique)

One user has many orders, one event has many seats, one order has many tickets, and a seat has at most one ticket. Tickets join orders and seats in a many to many relationship.

## 5. Preventing double booking

1. **Atomic hold:** one conditional update sets a seat to held only where it is available or its old hold has expired. One row changed means the seat is ours. None changed means someone else won, and the API replies 409. The database locks the row, so two requests cannot both win.
2. **Transaction:** paying marks seats sold and creates the order and tickets together, only if our unexpired hold still owns every seat.
3. **Constraint:** `tickets.seat_id` is unique, so even a bug cannot sell a seat twice.
4. **Cache:** the cached seat map is only for display. The database decides.

## 6. Architecture

```
Client => DNS => CDN => Load Balancer => Waiting Room
                                              |
                                         App Servers ==> Payment Provider
                                              |
                                  +===========+===========+
                                  v           v           v
                                Cache     Primary DB     Queue
                                              |           |
                                         Read Replica   Workers
```

* **Client, DNS, CDN:** the browser, the lookup that finds our servers, and a copy of images and pages near the user.
* **Load balancer:** spreads requests over servers and skips failed ones.
* **Waiting room:** admits buyers at a rate the system can handle.
* **App servers:** run the API, keep no data, and are added before a sale.
* **Cache:** serves seat maps from memory.
* **Primary database:** the source of truth for seats and orders.
* **Read replica:** answers browsing queries.
* **Queue and workers:** send tickets and release expired holds.
* **Payment provider:** an outside service that charges cards.

**Surviving the sale:** the waiting room lets in about 500 people per second, so the database sees about 1,000 hold attempts and 33 sales per second, not 10,000 requests.

## 7. Trade offs

1. **Fair waiting room:** exact positions for 200,000 buyers need only about 20 MB, but the queue store becomes another part that must not fail.
2. **Seat holds:** they stop double booking, but an unpaid hold keeps a seat unavailable until it expires.
3. **Eventual consistency:** cached seat maps can be seconds old, so some clicks get a 409, but checkout stays strictly consistent.