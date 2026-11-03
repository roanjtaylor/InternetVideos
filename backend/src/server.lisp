(in-package #:internet-vids)

(defvar *server* nil)

;;; Tiny TTL cache so the phone can refresh freely without burning quota.

(defvar *cache* (make-hash-table :test 'equal))
(defvar *cache-lock* (bt:make-lock "cache"))

(defun cached (key ttl-seconds thunk)
  (bt:with-lock-held (*cache-lock*)
    (let ((hit (gethash key *cache*)))
      (when (and hit (< (get-universal-time) (car hit)))
        (return-from cached (cdr hit)))))
  (let ((value (funcall thunk)))
    (bt:with-lock-held (*cache-lock*)
      (setf (gethash key *cache*) (cons (+ (get-universal-time) ttl-seconds) value)))
    value))

(defun clear-cache ()
  (bt:with-lock-held (*cache-lock*) (clrhash *cache*)))

;;; Handlers -------------------------------------------------------------

(defun respond-json (value &optional (status 200))
  (setf (ht:content-type*) "application/json; charset=utf-8"
        (ht:return-code*) status)
  (to-json value))

(defmacro define-api (name uri &body body)
  "An authenticated JSON endpoint. BODY may (return-from handler ...)."
  `(ht:define-easy-handler (,name :uri ,uri) ()
     (block handler
       (handler-case
           (progn
             (unless (equal (ht:header-in* "X-App-Key") (require-cfg "app_key"))
               (return-from handler (respond-json (obj "error" "unauthorized") 401)))
             ,@body)
         (error (e) (respond-json (obj "error" (princ-to-string e)) 500))))))

(ht:define-easy-handler (health :uri "/health") ()
  (respond-json (obj "ok" t
                     "authorized" (and (cfg "refresh_token") t)
                     "quota" (quota-status))))

(define-api api-feed "/feed"
  (respond-json
   (obj "videos" (cached "feed" (* 15 60)
                         (lambda () (remove-shorts (subscriptions-feed))))
        "quota" (quota-status))))

(define-api api-playlists "/playlists"
  (respond-json (obj "playlists" (cached "playlists" (* 5 60) #'my-playlists))))

(defun paged-playlist-response (cache-prefix playlist-id page &key shorts-removed)
  (destructuring-bind (videos . next)
      (cached (format nil "~A:~A:~A" cache-prefix playlist-id (or page "")) (* 5 60)
              (lambda ()
                (multiple-value-bind (videos next) (playlist-videos playlist-id :page-token page)
                  (cons (if shorts-removed (remove-shorts videos) videos) next))))
    (respond-json (obj "videos" videos "nextPage" (or next 'null)))))

(define-api api-playlist-items "/playlist"
  (let ((id (ht:get-parameter "id")))
    (unless id (return-from handler (respond-json (obj "error" "id required") 400)))
    (paged-playlist-response "pl" id (ht:get-parameter "page"))))

(define-api api-subscriptions "/subscriptions"
  (respond-json (obj "channels" (cached "subscriptions" (* 30 60) #'my-subscriptions))))

(define-api api-channel "/channel"
  (let ((id (ht:get-parameter "id")))
    (unless (and id (> (length id) 2))
      (return-from handler (respond-json (obj "error" "id required") 400)))
    (paged-playlist-response "ch" (uploads-playlist-id id) (ht:get-parameter "page")
                             :shorts-removed t)))

(define-api api-search "/search"
  (let ((q (ht:get-parameter "q")))
    (unless (and q (plusp (length q)))
      (return-from handler (respond-json (obj "error" "q required") 400)))
    (respond-json (obj "videos" (cached (concatenate 'string "q:" (string-downcase q)) (* 60 60)
                                        (lambda () (remove-shorts (search-videos q))))
                       "quota" (quota-status)))))

(define-api api-refresh "/refresh"
  (clear-cache)
  (respond-json (obj "ok" t)))

;;; One-time OAuth callback. No app key: Google's redirect cannot send one.

(defvar *auth-done* (bt:make-condition-variable))
(defvar *auth-done-lock* (bt:make-lock "auth-done"))
(defvar *auth-finished* nil)

(ht:define-easy-handler (oauth-callback :uri "/oauth/callback") (code error)
  (setf (ht:content-type*) "text/html")
  (cond (error (format nil "<h1>Google said: ~A</h1>" error))
        (code (exchange-code code)
              (bt:with-lock-held (*auth-done-lock*)
                (setf *auth-finished* t)
                (bt:condition-notify *auth-done*))
              "<h1>Internet Vids is authorized.</h1><p>Close this tab and return to the terminal.</p>")
        (t "<h1>Missing code</h1>")))

;;; Lifecycle -------------------------------------------------------------

(defun start (&key port)
  (load-config)
  (let ((port (or port (cfg "port" 8788))))
    (when *server* (stop))
    (setf *server* (make-instance 'ht:easy-acceptor :port port :address "0.0.0.0"
                                                    :access-log-destination nil))
    (ht:start *server*)
    (format t "Internet Vids listening on http://0.0.0.0:~A~%" port)
    *server*))

(defun stop ()
  (when *server* (ht:stop *server*) (setf *server* nil)))

(defun authorize ()
  "Run once: starts the server, prints the consent URL, waits for Google's redirect."
  (start)
  (format t "~%Open this URL in your browser and approve read access:~%~%~A~%~%" (consent-url))
  (finish-output)
  (bt:with-lock-held (*auth-done-lock*)
    (loop until *auth-finished* do (bt:condition-wait *auth-done* *auth-done-lock*)))
  (format t "Refresh token saved to ~A~%" *config-path*)
  (stop))

(defun main (cmd)
  (cond ((equal cmd "auth") (authorize))
        ((equal cmd "serve") (start) (loop (sleep 3600)))
        (t (format t "usage: sbcl --non-interactive --load run.lisp [auth|serve]~%"))))
