(in-package #:tubelens)

(defparameter *api-base* "https://www.googleapis.com/youtube/v3/")

;;; Quota bookkeeping (10,000 units/day by default, resets midnight Pacific).

(defvar *quota-used* 0)
(defvar *quota-day* "")
(defvar *quota-lock* (bt:make-lock "quota"))

(defun today-string ()
  (multiple-value-bind (s m h d mo y)
      (decode-universal-time (- (get-universal-time) (* 8 3600)) 0)
    (declare (ignore s m h))
    (format nil "~4,'0D-~2,'0D-~2,'0D" y mo d)))

(defun charge-quota (units)
  (bt:with-lock-held (*quota-lock*)
    (let ((today (today-string)))
      (unless (string= today *quota-day*)
        (setf *quota-day* today *quota-used* 0)))
    (incf *quota-used* units)))

(defun quota-status ()
  (obj "day" *quota-day* "used" *quota-used* "limit" 10000))

;;; Raw API call --------------------------------------------------------

(defun yt-get (endpoint params &key (units 1))
  "GET a Data API endpoint with the user's OAuth token. Returns parsed JSON."
  (charge-quota units)
  (let ((uri (quri:render-uri
              (quri:make-uri :defaults (concatenate 'string *api-base* endpoint)
                             :query params))))
    (handler-case
        (jzon:parse
         (dex:get uri :headers `(("Authorization" . ,(format nil "Bearer ~A" (access-token))))))
      (dex:http-request-failed (e)
        (error "YouTube API ~A ~A: ~A" endpoint (dex:response-status e) (dex:response-body e))))))

(defun yt-get-all (endpoint params &key (units 1) (max-pages 10))
  "Follow nextPageToken, returning the concatenated items as a vector."
  (let ((items '()) (token nil))
    (loop repeat max-pages
          do (let* ((q (if token (cons (cons "pageToken" token) params) params))
                    (resp (yt-get endpoint q :units units)))
               (loop for it across (or (jget resp "items") #()) do (push it items))
               (setf token (jget resp "nextPageToken"))
               (unless token (return))))
    (coerce (nreverse items) 'vector)))

;;; Shaping -------------------------------------------------------------

(defun best-thumb (snippet)
  (or (jget snippet "thumbnails" "medium" "url")
      (jget snippet "thumbnails" "high" "url")
      (jget snippet "thumbnails" "default" "url")))

(defun video-from-playlist-item (item)
  (let ((sn (jget item "snippet")))
    (obj "id" (jget item "contentDetails" "videoId")
         "title" (jget sn "title")
         "channelId" (or (jget sn "videoOwnerChannelId") (jget sn "channelId"))
         "channelTitle" (or (jget sn "videoOwnerChannelTitle") (jget sn "channelTitle"))
         "publishedAt" (or (jget item "contentDetails" "videoPublishedAt") (jget sn "publishedAt"))
         "thumbnail" (best-thumb sn))))

(defun video-from-search-item (item)
  (let ((sn (jget item "snippet")))
    (obj "id" (jget item "id" "videoId")
         "title" (jget sn "title")
         "channelId" (jget sn "channelId")
         "channelTitle" (jget sn "channelTitle")
         "publishedAt" (jget sn "publishedAt")
         "thumbnail" (best-thumb sn))))

(defun parse-iso8601-duration (s)
  "PT1H2M3S -> seconds."
  (if (null s) 0
      (let ((total 0) (num 0))
        (loop for ch across s
              do (cond ((digit-char-p ch) (setf num (+ (* num 10) (digit-char-p ch))))
                       ((char= ch #\H) (incf total (* num 3600)) (setf num 0))
                       ((char= ch #\M) (incf total (* num 60)) (setf num 0))
                       ((char= ch #\S) (incf total num) (setf num 0))
                       (t (setf num 0))))
        total)))

(defun attach-durations (videos)
  "videos.list in batches of 50 (1 unit each). Adds duration in seconds."
  (let ((by-id (make-hash-table :test 'equal)))
    (loop for v across videos do (setf (gethash (jget v "id") by-id) v))
    (let ((ids (loop for v across videos collect (jget v "id"))))
      (loop while ids
            do (let* ((batch (loop repeat 50 while ids collect (pop ids)))
                      (resp (yt-get "videos" `(("part" . "contentDetails")
                                               ("id" . ,(format nil "~{~A~^,~}" batch))))))
                 (loop for it across (or (jget resp "items") #())
                       do (let ((v (gethash (jget it "id") by-id)))
                            (when v
                              (setf (gethash "duration" v)
                                    (parse-iso8601-duration
                                     (jget it "contentDetails" "duration")))))))))
    videos))

;;; Public queries ------------------------------------------------------

(defun subscribed-channel-ids ()
  (let ((subs (yt-get-all "subscriptions"
                          '(("part" . "snippet") ("mine" . "true") ("maxResults" . "50")))))
    (loop for s across subs collect (jget s "snippet" "resourceId" "channelId"))))

(defun uploads-playlist-id (channel-id)
  "A channel's uploads playlist is its id with the UC prefix swapped for UU."
  (concatenate 'string "UU" (subseq channel-id 2)))

(defun sort-newest (videos)
  (sort videos #'string> :key (lambda (v) (or (jget v "publishedAt") ""))))

(defun subscriptions-feed (&key (per-channel 5) (limit 120))
  "Latest uploads across every subscription. ~1 unit per channel + 1 per 50 subs."
  (let ((videos '()))
    (dolist (cid (subscribed-channel-ids))
      (handler-case
          (let ((resp (yt-get "playlistItems"
                              `(("part" . "snippet,contentDetails")
                                ("playlistId" . ,(uploads-playlist-id cid))
                                ("maxResults" . ,(princ-to-string per-channel))))))
            (loop for it across (or (jget resp "items") #())
                  do (push (video-from-playlist-item it) videos)))
        (error (e) (format *error-output* "feed: skipping ~A: ~A~%" cid e))))
    (let ((v (sort-newest (coerce videos 'vector))))
      (attach-durations (subseq v 0 (min limit (length v)))))))

(defun my-playlists ()
  (let ((items (yt-get-all "playlists"
                           '(("part" . "snippet,contentDetails") ("mine" . "true") ("maxResults" . "50")))))
    (map 'vector
         (lambda (p)
           (obj "id" (jget p "id")
                "title" (jget p "snippet" "title")
                "itemCount" (jget p "contentDetails" "itemCount")
                "thumbnail" (best-thumb (jget p "snippet"))))
         items)))

(defun playlist-videos (playlist-id)
  (let ((items (yt-get-all "playlistItems"
                           `(("part" . "snippet,contentDetails")
                             ("playlistId" . ,playlist-id)
                             ("maxResults" . "50"))
                           :max-pages 4)))
    (attach-durations
     (remove-if (lambda (v) (member (jget v "title") '("Private video" "Deleted video")
                                    :test #'equal))
                (map 'vector #'video-from-playlist-item items)))))

(defun search-videos (query)
  "100 units per call: keep it deliberate."
  (let ((resp (yt-get "search"
                      `(("part" . "snippet") ("q" . ,query) ("type" . "video") ("maxResults" . "25"))
                      :units 100)))
    (attach-durations (map 'vector #'video-from-search-item (or (jget resp "items") #())))))
