# SnapShare Scaling Plan

## 1. Assumptions

* 10,000,000 registered users, 10 percent active each day, so 1,000,000 daily active users
* Each active user uploads 1 photo and views 50 feed pages per day
* A photo is 2 MB and its thumbnail is 50 KB
* Peak traffic is 5 times the average, and a day has 86,400 seconds

## 2. Estimates

* Uploads: 1,000,000 per day, about 12 per second on average and about 58 at peak
* Feed views: 50,000,000 per day, about 579 per second on average and about 2,900 at peak
* Storage per year: 1,000,000 x (2 MB + 50 KB) x 365 = about 748 TB (730 TB of originals and 18 TB of thumbnails)

## 3. Read heavy or write heavy

SnapShare is read heavy: about 579 reads per second against 12 writes, a ratio of 50 to 1. So we put our effort into caching, a CDN and read replicas. Writes are few, so one primary database is enough, and slow work such as thumbnails can run in the background.

## 4. Why photos stay out of the database

748 TB per year would make the database huge, slow to back up and costly, and large files would tie up connections. Photo files go into object storage, and the database keeps only a small record with the owner, the file key and the status.

## 5. What each component does

* **CDN:** It serves photos from servers near the user, which fixes slow loading and takes load off our servers.
* **Load balancer:** It spreads requests across the app servers, which fixes overload and keeps the app running when one server fails.
* **App servers:** They run the upload and feed logic and keep no data, so we can add more copies when traffic grows.
* **Cache:** It keeps popular feeds in memory, which fixes the database repeating the same work.
* **Primary database:** It stores users, follows and photo records and accepts all writes, which keeps the data consistent.
* **Read replica:** It is a live copy that answers reads, which fixes heavy reading crowding out writes.
* **Object storage:** It holds the photo files cheaply and safely, which fixes files being too big for a database.
* **Queue:** It holds thumbnail jobs, which fixes uploads having to wait for slow image processing.
* **Thumbnail worker:** It turns jobs into 50 KB thumbnails, which fixes slow feeds that would otherwise load 2 MB photos.

## 6. Upload flow step by step

1. The client sends the upload to the load balancer, which forwards it to an app server.
2. The app server checks the login and that the file is a valid image.
3. The app server saves the original 2 MB photo in object storage and gets back the file key.
4. The app server writes a database record with the owner, the file key and the status "processing".
5. The app server puts a thumbnail job on the queue.
6. The app server replies to the client with success, so the user gets confirmation without waiting for the thumbnail.
7. The queue hands the job to a free worker, which reads the original, creates the 50 KB thumbnail and saves it in object storage.
8. The worker sets the record to "ready". If the worker fails, the job returns to the queue and is tried again.
9. Followers see the thumbnail through the CDN, which fetches it from object storage the first time.

## 7. Trade offs

1. **Background thumbnails.** Uploads reply fast and bursts are absorbed, but a new photo may briefly have no thumbnail, so the app shows a placeholder, and the queue and workers are more parts to run.
2. **Cached feeds.** Feeds load fast and the database is protected, but a cached feed can be a few seconds out of date, so we use a short expiry time.
3. **Read replica.** It scales reads, but it can lag behind the primary, so a user's own recent photos are read from the primary or the cache.

## 8. Architecture diagram

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

The app server also saves each original photo into object storage.