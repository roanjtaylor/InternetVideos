(in-package #:internet-videos)

;;; youtube.com/shorts/<id> answers 200 for a Short and redirects to /watch
;;; for a normal video. Cached forever per id; the fact never changes.

(defvar *shorts-cache* (make-hash-table :test 'equal))
(defvar *shorts-lock* (bt:make-lock "shorts"))

;;; SOCS=CAI skips the EU/UK consent interstitial. Do not add a browser
;;; User-Agent: a long one trips a Winsock error (122) under SBCL on Windows.
(defparameter *probe-headers* '(("Cookie" . "SOCS=CAI")))

(defun probe-short (id)
  "Returns :short, :video, or :unknown. HEAD so nothing is downloaded."
  (handler-case
      (multiple-value-bind (body status headers)
          (dex:head (format nil "https://www.youtube.com/shorts/~A" id)
                    :headers *probe-headers* :max-redirects 0)
        (declare (ignore body))
        (let ((location (gethash "location" headers)))
          (cond ((= status 200) :short)
                ((and (<= 300 status 399) location (search "/watch" location)) :video)
                ((and (<= 300 status 399) location (search "/shorts/" location)) :short)
                (t :unknown))))
    (error () :unknown)))

(defun heuristic-short-p (video)
  (let ((d (or (jget video "duration") 0))
        (title (or (jget video "title") "")))
    (or (and (> d 0) (<= d 60))
        (search "#shorts" (string-downcase title)))))

(defun short-p (video)
  (let ((id (jget video "id")))
    (bt:with-lock-held (*shorts-lock*)
      (multiple-value-bind (v found) (gethash id *shorts-cache*)
        (when found (return-from short-p v))))
    (let* ((probe (probe-short id))
           (result (case probe
                     (:short t)
                     (:video nil)
                     (t (and (heuristic-short-p video) t)))))
      (bt:with-lock-held (*shorts-lock*)
        (setf (gethash id *shorts-cache*) result))
      result)))

(defun remove-shorts (videos)
  "Probe in parallel threads (network bound), then drop Shorts."
  (let ((threads (map 'list (lambda (v) (bt:make-thread (lambda () (short-p v)))) videos)))
    (mapc #'bt:join-thread threads))
  (remove-if #'short-p videos))
