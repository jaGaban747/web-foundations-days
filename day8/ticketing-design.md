# TicketHub Design

TicketHub is a website that sells tickets for concerts and events. It has 2 million registered users.

## 1. Requirements

### Functional

* Register and log in
* Browse and search events by name, city and date
* View an event with its seat map and live availability
* Hold up to 4 seats for 5 minutes
* Pay for held seats and receive the tickets
* View my orders and tickets, and release a hold

### Non functional

* **Correctness:** a seat is never sold twice, and a customer who is charged always gets a ticket.
* **Fairness:** in a big sale, buyers are served in a fair order, and nobody can take more than 4 seats.
* **Speed:** browsing answers in under 200 milliseconds and a seat hold in under 1 second.
* **Availability:** the site stays up during a big sale, and 99.9 percent of the time otherwise.
* **Scalability:** it survives bursts of about 575 times normal traffic.
* **Durability:** a paid order is never lost.
* **Security:** all traffic uses HTTPS, and card details are handled only by the payment provider.

## 2. Estimates

### Normal day

* Page views: 50,000 visitors x 10 pages = 500,000 per day, about 5.8 per second on average and about 29 at peak (5 times)
* Tickets sold: 5,000 per day, about 0.06 per second, which is one every 17 seconds

### Big sale

* 200,000 people arrive in 10 minutes (600 seconds), about 333 arrivals per second
* Each person makes about 10 requests (seat maps, hold attempts, payment), so about 2,000,000 requests in 10 minutes, or about **3,300 requests per second**. The first minute is busier, about 3 times that, or **10,000 per second**.
* Hold attempts: 200,000 people x 3 attempts = 600,000, about 1,000 per second
* Seats sold: 20,000 in 10 minutes, about 33 per second

### Comparison

A big sale brings about 575 times the normal traffic (3,300 against 5.8 per second), and 1,700 times in the first minute. Seat sales also rise by 575 times (33 per second against 0.06). Demand is 10 times supply (200,000 buyers for 20,000 seats), so 90 percent of people will not get a seat. We must design for the sale, not for a normal day, and we must be fair and clear with the people who miss out.

## 3. API

* `GET /api/v1/events?city=Nairobi&page=1`: list events. Success: `200`
* `GET /api/v1/events/{id}`: one event's details. Success: `200`
* `GET /api/v1/events/{id}/seats`: the seat map with a status for each seat. Success: `200`
* `POST /api/v1/events/{id}/holds`: hold seats for 5 minutes. Body: `{ "seatIds": [101, 102] }`. Success: `201` with a `holdId` and `expiresAt`. If a seat is taken: `409`.
* `DELETE /api/v1/holds/{holdId}`: release a hold. Success: `204`
* `POST /api/v1/orders`: pay for a hold. Body: `{ "holdId": "h42", "paymentToken": "tok_abc" }`, sent with an idempotency key header so a retry never charges twice. Success: `201`. Errors: `410` if the hold expired, `402` if payment fails.
* `GET /api/v1/orders/{id}`: one order. Success: `200`
* `GET /api/v1/me/tickets`: my tickets. Success: `200`

## 4. Data model

* **users:** `id` (primary key), `name`, `email` (unique), `password_hash`, `created_at`
* **events:** `id` (primary key), `name`, `venue`, `city`, `starts_at`, `on_sale_at`
* **seats:** `id` (primary key), `event_id` (foreign key to events), `section`, `row_label`, `seat_number`, `price_cents`, `status` (available, held or sold), `hold_id`, `held_by` (foreign key to users), `hold_expires_at`. The combination of event, section, row and seat number is unique.
* **orders:** `id` (primary key), `user_id` (foreign key to users), `event_id` (foreign key to events), `total_cents`, `status`, `payment_ref`, `idempotency_key` (unique), `created_at`
* **tickets:** `id` (primary key), `order_id` (foreign key to orders), `seat_id` (foreign key to seats, **unique**), `code` (unique)

### Relationships

* One user has many orders (one to many).
* One event has many seats (one to many).
* One order has many tickets (one to many).
* A seat has at most one ticket, which the unique rule on `seat_id` enforces.
* Orders and seats are many to many, and the tickets table is the join table between them.

## 5. Preventing two people from buying the same seat

1. **An atomic conditional update takes the hold.** The database changes a seat only if it is still free, and only one of two simultaneous requests can win:

```sql
UPDATE seats
SET status = 'held', hold_id = :hold, held_by = :user, hold_expires_at = :later
WHERE id = :seat
  AND (status = 'available' OR (status = 'held' AND hold_expires_at < :now));
```

   If the number of rows changed is 1, the seat is ours. If it is 0, someone else got there first and the API replies `409`. The database locks the row during the update, so the second request waits, checks the condition again, and loses.
2. **A transaction makes holds all or nothing.** If we hold 3 seats and one is taken, the whole transaction rolls back, so nobody is left with a partial set.
3. **Holds expire after 5 minutes.** The condition above treats an expired hold as free, so a seat never stays locked by someone who left. A worker also cleans up expired holds.
4. **Payment finishes in one transaction.** The server marks the seats sold only where `status` is held, `hold_id` and `held_by` match and the hold has not expired. If fewer rows change than the seats ordered, it rolls back and refunds. The order and the tickets are created in the same transaction.
5. **A constraint is the final safety net.** `tickets.seat_id` is unique, so even a bug in the code cannot create two tickets for one seat, because the database refuses the second one.
6. **The cache never decides.** The seat map in the cache is only for display and can be a few seconds old. The database has the final say, and a stale click simply gets a `409`.

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

### Components

* **Client:** the browser or app where people browse, queue and buy.
* **DNS:** it turns the TicketHub name into the address of the load balancer.
* **CDN:** it serves images, scripts and event pages from servers near the user, so most of the browsing load never reaches us.
* **Load balancer:** it spreads requests over the app servers and removes any that fail.
* **Waiting room:** it lets buyers into the sale at a rate the system can handle, which fixes the crush of 10,000 requests per second.
* **App servers:** they run the API, keep no data of their own, and are scaled up before a known sale.
* **Cache:** it serves seat maps and event data from memory, so the database is not asked the same question thousands of times.
* **Primary database:** it holds the seats and orders, accepts all writes, and is the single source of truth that prevents double booking.
* **Read replica:** it answers browsing queries so they do not compete with seat updates.
* **Queue and workers:** they handle slow tasks such as sending tickets and emails and releasing expired holds, so buyers do not wait for them.
* **Payment provider:** an outside service that charges the card, so we never store card details.

### How it survives the big sale

* The sale time is known, so we add app servers and warm the cache beforehand.
* The waiting room admits, say, 500 people per second. All 200,000 are in within about 7 minutes, and the database only sees a controlled flow.
* Positions are fair: everyone who arrives in the first minute is placed by random draw, and later arrivals are placed in order of arrival. Each person can hold at most 4 seats.
* The CDN and the cache absorb the browsing traffic, so the primary only handles holds and orders, about 1,000 attempts and 33 sales per second.
* Seats can be split by event, so one sale cannot slow another event.

## 7. Trade offs

1. **Waiting room.** It protects the system and gives a fair order, but buyers must wait, sometimes for minutes, and it is one more component to build and run.
2. **Seat holds with a timeout.** They stop double booking and give people time to pay, but a seat held by someone who never pays looks unavailable until the hold expires. A shorter hold frees seats faster but rushes buyers.
3. **One primary database for seats.** Strong consistency makes double booking impossible, but all seat writes go through one machine, which limits growth. We accept this because 1,000 simple updates per second is within reach, and we can split by event if needed.
4. **A cached seat map.** It is fast and cheap, but a seat shown as free may already be taken, so some clicks fail with a `409` and the app must show a friendly message.