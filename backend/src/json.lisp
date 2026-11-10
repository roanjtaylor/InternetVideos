(in-package #:internet-videos)

(defun obj (&rest kvs)
  "Build a JSON object (equal hash-table) from alternating key/value args."
  (let ((h (make-hash-table :test 'equal)))
    (loop for (k v) on kvs by #'cddr do (setf (gethash k h) v))
    h))

(defun jget (object &rest path)
  "Walk a parsed JSON object by string keys / integer indices. NIL if absent."
  (let ((cur object))
    (dolist (k path cur)
      (setf cur
            (cond ((null cur) nil)
                  ((eq cur 'null) nil)
                  ((integerp k) (and (vectorp cur) (< k (length cur)) (aref cur k)))
                  ((hash-table-p cur) (let ((v (gethash k cur))) (if (eq v 'null) nil v)))
                  (t nil))))))

(defun to-json (value)
  (jzon:stringify value))
