;;; Offline-ish smoke test (no Google credentials needed):
;;;   sbcl --non-interactive --load smoke.lisp
(load (merge-pathnames "quicklisp/setup.lisp" (user-homedir-pathname)))
(push (directory-namestring *load-truename*) asdf:*central-registry*)
(ql:quickload "tubelens" :silent t)
(in-package :tubelens)

(format t "~%duration PT1H2M3S -> ~A~%" (parse-iso8601-duration "PT1H2M3S"))
(format t "probe normal video -> ~A~%" (probe-short "dQw4w9WgXcQ"))
(format t "probe a Short      -> ~A~%" (probe-short "wp4ySA43dqA"))

(start :port 8799)
(setf (cfg "app_key") "test")
(format t "health -> ~A~%" (dex:get "http://localhost:8799/health"))
(format t "feed without key -> ~A~%"
        (handler-case (dex:get "http://localhost:8799/feed")
          (dex:http-request-failed (e) (dex:response-status e))))
(format t "feed with key, no token -> ~A~%"
        (handler-case (dex:get "http://localhost:8799/feed" :headers '(("X-App-Key" . "test")))
          (dex:http-request-failed (e) (format nil "~A ~A" (dex:response-status e) (dex:response-body e)))))
(stop)
(format t "SMOKE-DONE~%")
