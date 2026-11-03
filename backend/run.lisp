;;; Entry point. From the backend/ directory:
;;;   sbcl --non-interactive --load run.lisp auth    ; one-time Google consent
;;;   sbcl --non-interactive --load run.lisp serve   ; run the API
(load (merge-pathnames "quicklisp/setup.lisp" (user-homedir-pathname)))
(push (directory-namestring *load-truename*) asdf:*central-registry*)
(ql:quickload "internet-vids" :silent t)
(internet-vids:main (find-if (lambda (a) (member a '("auth" "serve") :test #'equal))
                        sb-ext:*posix-argv*))
