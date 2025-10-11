import sqlite3

DB_FILE = 'students.db'

conn = sqlite3.connect(DB_FILE)
c = conn.cursor()

# 给 student 表增加 class_name 列，如果已经存在会报错，可以忽略
try:
    c.execute("ALTER TABLE student ADD COLUMN class_name TEXT")
except sqlite3.OperationalError:
    print("class_name 列已存在，跳过")

# 给 student 表增加 grades 列（存储 JSON）
try:
    c.execute("ALTER TABLE student ADD COLUMN grades TEXT")
except sqlite3.OperationalError:
    print("grades 列已存在，跳过")

conn.commit()
conn.close()

print("数据库字段检查/添加完成")
