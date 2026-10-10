# SnapShare Scaling Plan

SnapShare is a photo sharing app where users upload photos and scroll a feed of photos from the people they follow.

## 1. Assumptions

* 10,000,000 registered users
* 10 percent of users are active each day
* Each active user uploads 1 photo per day
* Each active user views 50 feed pages per day
* An average photo is 2 MB, and each photo also gets a 50 KB thumbnail
* Peak traffic is 5 times the average
* A day has 86,400 seconds
* I assume each feed page shows 10 thumbnails (used only for the bandwidth estimate)
* I assume one photo record in the database is about 500 bytes
* I use decimal units: 1 TB is 1,000,000 MB

Daily active users: 10,000,000 x 10 percent = **1,000,000 users per day**.

## 2. Estimates

### Uploads per second

* Uploads per day: 1,000,000 users x 1 photo = 1,000,000 photos
* Average: 1,000,000 / 86,400 = about **12 uploads per second**
* Peak: about 12 x 5 = about **58 uploads per second** (using the unrounded figure of 11.6)

### Feed views per second

* Feed views per day: 1,000,000 users x 50 pages = 50,000,000 views
* Average: 50,000,000 / 86,400 = about **579 views per second**
* Peak: 579 x 5 = about **2,900 views per second**

### Photo storage per year

* Originals per day: 1,000,000 x 2 MB = 2,000,000 MB = 2 TB
* Thumbnails per day: 1,000,000 x 50 KB = 50 GB
* Total per day: about 2.05 TB
* Originals per year: 2 TB x 365 = 730 TB
* Thumbnails per year: 50 GB x 365 = 18,250 GB = about 18 TB
* Total photo storage per year: about **748 TB, close to three quarters of a petabyte**

### Other useful figures

* Upload bandwidth: 12 x 2 MB = about 24 MB per second on average, and about 116 MB per second at peak
* Feed bandwidth: 579 pages x 10 thumbnails x 50 KB = about 290 MB per second on average, and about 1.45 GB per second at peak
* Database records: 1,000,000 photos per day x 365 = 365 million rows, at 500 bytes each about 183 GB per year

## 3. Read heavy or write heavy

SnapShare is **read heavy**. Every active user views 50 feed pages for each photo they upload, so reads outnumber writes by about 50 to 1 (579 reads per second against 12 writes per second).

What this means for the design:

* Reads are the main load, so we put effort into caching, a CDN and read replicas.
* Writes are small in number. About 58 writes per second at peak is easy for one primary database, so we do not need to split the database on day one.
* Uploads are slow because the files are large, but they do not need to finish every job before replying, so heavy work such as thumbnails can run in the background.

## 4. Why photos do not belong in the database

At about 748 TB per year, photo files would make the database enormous. Backups, replication and restores would become very slow and very costly, and every database connection used to stream a 2 MB file is a connection not available for fast queries. Databases are also much more expensive per gigabyte than file storage.

Instead, photo files go into **object storage**, which is cheap, durable and built to hold huge numbers of files. The database keeps only a small record for each photo: the owner, the file key (its location in object storage), the time and the status. The app and the CDN use that key to find the file.

## 5. Architecture diagram

```
            Users (mobile app and web browser)
              |                                         ^
              | 1. API requests                         | 6. photo files
              v                                         |
     +==================+                        +==============+
     |  Load Balancer   |                        |     CDN      |
     +==================+                        +==============+
              |                                         ^
              v                                         | 5. on a miss, the CDN
     +==================+                               | fetches the file from
     |   App Servers    |                               | object storage
     |  (many copies)   |                               |
     +==================+                               |
              |                                         |
        +=====+=========+=================+             |
        v               v                 v             |
   +=========+   +=============+   +=============+      |
   |  Cache  |   | Database    |   |    Queue    |      |
   |         |   | (primary)   |   | (thumb jobs)|      |
   +=========+   +=============+   +=============+      |
                        |                 |             |
                        v                 v             |
                 +=============+   +=============+      |
                 |    Read     |   |  Thumbnail  |==>+================+
                 |   Replica   |   |   Worker    |   | Object Storage |
                 +=============+   +=============+   | originals and  |
                                                      | thumbnails     |
                                                      +================+
```

How to read it:

* The app server saves each original photo into object storage and puts a job on the queue. That link is left out of the drawing to keep it readable.
* The cache sits beside the app servers and holds feeds and photo details that are requested often.
* The database primary handles all writes. The read replica holds a copy and answers read queries.
* The worker reads jobs from the queue and saves finished thumbnails into object storage.
* The CDN pulls files from object storage and keeps copies close to users.

## 6. What each component does

* **CDN:** It serves photos and thumbnails from servers close to each user, which fixes slow loading and takes most of the heavy file traffic off our own servers.
* **Load balancer:** It spreads incoming requests across many app servers, which fixes overload on a single machine and keeps the app running if one server fails.
* **App servers:** They run the login, upload and feed logic, and because they keep no data of their own we can add more copies whenever traffic grows.
* **Cache:** It keeps frequently requested data such as feeds and photo details in memory, which fixes the problem of the database answering the same question again and again.
* **Database (primary):** It stores users, follows and photo records, and it is the one place that accepts writes, which keeps our data consistent.
* **Read replica:** It is a live copy of the database that answers read queries, which fixes the problem of heavy reads crowding out writes on the primary.
* **Object storage:** It stores the photo files cheaply and safely at a scale of hundreds of terabytes, which fixes the problem of files being too big and too costly for a database.
* **Queue:** It holds thumbnail jobs until a worker is ready, which fixes the problem of uploads having to wait for slow image processing.
* **Thumbnail worker:** It takes jobs from the queue, creates the 50 KB thumbnail and saves it, which fixes the problem of slow feeds that would otherwise load full 2 MB photos.

## 7. Upload flow step by step

1. The user chooses a photo, and the app sends the upload request to the load balancer.
2. The load balancer forwards the request to one of the app servers.
3. The app server checks that the user is logged in and that the file is a valid image of an allowed size.
4. The app server saves the original 2 MB photo into object storage and receives the file key.
5. The app server writes a record in the database primary with the owner, the file key, the time and the status "processing".
6. The app server puts a thumbnail job on the queue with the photo id and file key.
7. The app server replies to the user straight away with a success message, so the user does not wait for the thumbnail.
8. A worker takes the job from the queue, reads the original from object storage, creates the 50 KB thumbnail and saves it back into object storage.
9. The worker updates the database record to the status "ready" and stores the thumbnail key. If the worker fails, the job returns to the queue and is tried again.
10. When followers open their feeds, thumbnails load through the CDN. On the first request the CDN fetches the file from object storage and keeps a copy for the next viewers.

## 8. Trade offs

1. **Thumbnails in the background, through a queue.** Uploads reply quickly and the system copes with bursts, but a new photo may briefly have no thumbnail, so the app must show a placeholder. We also add more parts to build and watch: the queue, the workers, retries and monitoring.
2. **Caching feeds.** Feeds load much faster and the database is protected, but cached data can be slightly out of date, so a new photo may take a few seconds to appear for followers. Deciding when to remove old cache entries is hard, and a short expiry time is the simple compromise.
3. **Read replica.** It lets us handle the read load, but the replica can lag a moment behind the primary. A user could upload a photo and not see it right away if we read from the replica, so reads of a user's own recent photos should go to the primary or the cache. A replica also adds cost.
4. **Using a CDN.** It makes photos load quickly for users far from our servers, but it costs money and a changed or deleted photo may stay visible on the edge servers until its copy expires.