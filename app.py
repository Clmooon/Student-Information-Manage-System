from flask import Flask, jsonify, request, session, send_file, render_template
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import os
from io import BytesIO
import matplotlib.pyplot as plt
import numpy as np

# ---------- 配置 ----------
APP_SECRET = os.environ.get('APP_SECRET') or 'change_this_secret_for_prod'
DB_FILE = 'students.db'

app = Flask(__name__)
app.config['SECRET_KEY'] = APP_SECRET
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_FILE}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# ---------- 数据模型 ----------
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), default='student')  # teacher / student
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Student(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    age = db.Column(db.Integer, default=0)
    gender = db.Column(db.String(20))
    major = db.Column(db.String(120))
    grade = db.Column(db.Float, default=0.0)

# ---------- 装饰器 ----------
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id'):
            return jsonify({'error':'login_required'}), 401
        return f(*args, **kwargs)
    return decorated

def teacher_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if session.get('role') != 'teacher':
            return jsonify({'error':'forbidden'}), 403
        return f(*args, **kwargs)
    return decorated

# ---------- 初始化数据库 ----------
def init_db():
    db.create_all()
    # 不自动生成默认用户和学生
    db.session.commit()

# ---------- 认证 ----------
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({'error':'invalid credentials'}), 401
    session['user_id'] = user.id
    session['username'] = user.username
    session['role'] = user.role
    return jsonify({'ok': True, 'username': user.username, 'role': user.role})

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'ok': True})

@app.route('/api/me')
def api_me():
    uid = session.get('user_id')
    if not uid:
        return jsonify({'logged_in': False})
    return jsonify({'logged_in': True, 'username': session.get('username'), 'role': session.get('role')})

# ---------- 用户注册 ----------
@app.route('/api/register', methods=['POST'])
def api_register_user():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    if not username or not password:
        return jsonify({'error':'用户名和密码必填'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error':'用户名已存在'}), 400

    # 默认角色为 student
    user = User(username=username, password_hash=generate_password_hash(password), role='student')
    db.session.add(user)
    db.session.commit()
    return jsonify({'ok': True})

# ---------- 管理用户列表 ----------
@app.route('/api/users', methods=['GET'])
@login_required
@teacher_required
def api_list_users():
    users = User.query.all()
    return jsonify([{'id':u.id,'username':u.username,'role':u.role} for u in users])

@app.route('/api/users/<int:uid>', methods=['DELETE'])
@login_required
@teacher_required
def api_delete_user(uid):
    if uid == session.get('user_id'):
        return jsonify({'error':'不能删除自己'}), 400
    user = User.query.get(uid)
    if not user:
        return jsonify({'error':'not found'}),404
    db.session.delete(user)
    db.session.commit()
    return jsonify({'ok': True})

# ---------- 学生 CRUD ----------
@app.route('/api/students', methods=['GET'])
@login_required
def api_list_students():
    q = request.args.get('q','').strip()
    query = Student.query
    if q:
        query = query.filter(db.or_(Student.name.ilike(f'%{q}%'), Student.major.ilike(f'%{q}%')))
    students = query.all()
    return jsonify([{'id':s.id,'name':s.name,'age':s.age,'gender':s.gender,'major':s.major,'grade':s.grade} for s in students])

@app.route('/api/students', methods=['POST'])
@login_required
@teacher_required
def api_add_student():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name: return jsonify({'error':'name required'}), 400
    s = Student(
        name=name,
        age=int(data.get('age') or 0),
        gender=data.get('gender') or '',
        major=data.get('major') or '',
        grade=float(data.get('grade') or 0.0)
    )
    db.session.add(s)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/students/<int:sid>', methods=['PUT'])
@login_required
@teacher_required
def api_update_student(sid):
    s = Student.query.get(sid)
    if not s: return jsonify({'error':'not found'}),404
    data = request.get_json() or {}
    for k in ['name','age','gender','major','grade']:
        if k in data: setattr(s,k,data[k] if k not in ['age','grade'] else float(data[k]))
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/students/<int:sid>', methods=['DELETE'])
@login_required
@teacher_required
def api_delete_student(sid):
    s = Student.query.get(sid)
    if not s: return jsonify({'error':'not found'}),404
    db.session.delete(s)
    db.session.commit()
    return jsonify({'ok': True})

# ---------- 绘图 ----------
@app.route('/api/plot/grades.png')
@login_required
def api_plot():
    students = Student.query.all()
    grades = [s.grade for s in students if isinstance(s.grade,(int,float))]
    fig, ax = plt.subplots(figsize=(6,4))
    if not grades:
        ax.text(0.5,0.5,'No data',ha='center',va='center',fontsize=14)
        ax.set_axis_off()
    else:
        arr = np.array(grades)
        ax.bar(range(len(arr)), arr)
        ax.set_title('Grade Distribution')
        ax.set_xlabel('Student')
        ax.set_ylabel('Grade')
    buf = BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format='png')
    plt.close(fig)
    buf.seek(0)
    return send_file(buf, mimetype='image/png')

# ---------- 前端 ----------
@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    with app.app_context():
        init_db()
    app.run(debug=True)
