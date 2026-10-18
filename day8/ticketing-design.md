# TicketHub Design

## 1. Requirements

**Functional:** register and log in, browse events, view a seat map, hold up to 4 seats for 5 minutes, pay and get tickets, view my tickets.

**Non functional:** correctness (a seat is never sold twice), fairness (a fair order in a big sale), speed (browsing under 200 ms, a hold under 1 second), availability (up during the sale), scalability (bursts of 575 times normal), durability (paid orders are never lost), security (HTTPS, no card data stored).

## 2. Estimates

* **Normal day:** 50,000 visitors x 10 pages = 500,000 views, about 6 per second (29 at peak). 5,000 tickets, about 0.06 per second.
* **Big sale:** 200,000 people in 600 seconds is about 333 arrivals per second. At 10 requests each that is about 3,300 requests per second (10,000 in the first minute). 20,000 seats in 10 minutes is about 33 sales per second.
* **Comparison:** about 575 times normal traffic. Demand is 10 times supply, so 90 percent of buyers miss out. We design for the sale.

## 3. API

* `GET /api/v1/events`: list events (200)
* `GET /api/v1/events/{id}/seats`: seat map with each seat's status (200)
* `POST /api/v1/events/{id}/holds`: hold seats, body `{ "seatIds": [101, 102] }` (201, or 409 if a seat is taken)
* `DELETE /api/v1/holds/{holdId}`: release a hold (204)
* `POST /api/v1/orders`: pay, body `{ "holdId": "h42", "paymentToken": "tok_abc" }` (201, 410 if the hold expired, 402 if payment fails)
* `GET /api/v1/me/tickets`: my tickets (200)

## 4. Data model

* **users:** id (primary key), name, email (unique)
* **events:** id (primary key), name, venue, starts_at
* **seats:** id (primary key), event_id (foreign key), section, row_label, seat_number, price, status, hold_id, held_by (foreign key to users), hold_expires_at
* **orders:** id (primary key), user_id (foreign key), event_id (foreign key), idempotency_key (unique)
* **tickets:** id (primary key), order_id (foreign key), seat_id (foreign key, unique)

One user has many orders, one event has many seats, and one order has many tickets. A seat has at most one ticket, and tickets join orders and seats in a many to many relationship.

## 5. Preventing two people from buying the same seat

1. **Atomic hold:** one conditional update sets a seat to held only where it is still available or its old hold has expired. If one row changes, the seat is ours. If none change, someone else won and the API replies 409. The database locks the row, so two simultaneous requests cannot both win.
2. **Transactions:** holding several seats is all or nothing. Paying marks the seats sold and creates the order and tickets in one transaction that succeeds only if our unexpired hold still owns every seat.
3. **Expiry:** holds last 5 minutes, and an expired hold counts as available.
4. **Constraint:** `tickets.seat_id` is unique, so even a code bug cannot sell one seat twice.
5. **Cache:** the seat map in the cache is for display only. The database decides, and a stale click gets a 409.

## 6. Architecture

```
Client ==> DNS ==> CDN ==> Load Balancer ==> Waiting Room
                                                  |
                                                  v
                                         App Servers (many) ==> Payment Provider
                                                  |
                      +===========================+===========================+
                      v                           v                           v
                    Cache                  Primary Database                 Queue
                  (seat map)                      |                           |
                                                  v                           v
                                            Read Replica                   Workers
                                                                  (tickets, emails, release holds)
```

* **Client and DNS:** the browser, and the lookup that finds our servers.
* **CDN:** serves images and event pages near the user, so browsing rarely reaches us.
* **Load balancer:** spreads requests across servers and skips failed ones.
* **Waiting room:** admits buyers at a rate the system can handle.
* **App servers:** run the API, keep no data, and are added before a sale.
* **Cache:** serves seat maps from memory instead of asking the database each time.
* **Primary database:** the one source of truth for seats and orders.
* **Read replica:** answers browsing queries away from seat updates.
* **Queue and workers:** send tickets and emails and release expired holds.
* **Payment provider:** an outside service that charges cards.

**Surviving the sale:** we add servers and warm the cache beforehand. The waiting room lets in about 500 people per second, drawn at random for the first minute and then in order, so the database sees about 1,000 hold attempts and 33 sales per second.

## 7. Trade offs

1. **Waiting room:** fair and protective, but buyers wait and it is one more part to run.
2. **Seat holds:** they stop double booking, but an unpaid hold keeps a seat unavailable until it expires.
3. **One primary database:** seats stay consistent, but all writes use one machine, so we would split by event if it grew.