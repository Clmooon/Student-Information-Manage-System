from flask import Flask, jsonify, request, session, send_file, render_template
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import os
from io import BytesIO
import matplotlib
matplotlib.use('Agg')  # 使用非GUI后端
import matplotlib.pyplot as plt
import numpy as np
import json
import pandas as pd
from werkzeug.utils import secure_filename


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
    class_name = db.Column(db.String(50))
    grades = db.Column(db.Text)  # JSON 存储

# ---------- 装饰器 ----------
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id'):
            return jsonify({'error': 'login_required'}), 401
        return f(*args, **kwargs)
    return decorated

def teacher_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if session.get('role') != 'teacher':
            return jsonify({'error': 'forbidden'}), 403
        return f(*args, **kwargs)
    return decorated

# ---------- 初始化数据库 ----------
def init_db():
    db.create_all()
    db.session.commit()

# ---------- 认证 ----------
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'invalid credentials'}), 401
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
        return jsonify({'error': '用户名和密码必填'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'error': '用户名已存在'}), 400
    user = User(username=username, password_hash=generate_password_hash(password), role='student')
    db.session.add(user)
    db.session.commit()
    return jsonify({'ok': True})

# ---------- 用户管理 ----------
@app.route('/api/users', methods=['GET'])
@login_required
@teacher_required
def api_list_users():
    users = User.query.all()
    return jsonify([{'id': u.id, 'username': u.username, 'role': u.role} for u in users])

@app.route('/api/users/<int:uid>', methods=['DELETE'])
@login_required
@teacher_required
def api_delete_user(uid):
    if uid == session.get('user_id'):
        return jsonify({'error': '不能删除自己'}), 400
    user = User.query.get(uid)
    if not user:
        return jsonify({'error': 'not found'}), 404
    db.session.delete(user)
    db.session.commit()
    return jsonify({'ok': True})

# ---------- 学生 CRUD ----------
@app.route('/api/students', methods=['GET'])
@login_required
def api_list_students():
    q = request.args.get('q', '').strip()
    query = Student.query
    if q:
        query = query.filter(db.or_(Student.name.ilike(f'%{q}%'), Student.major.ilike(f'%{q}%')))
    students = query.all()
    result = []
    for s in students:
        result.append({
            'id': s.id,
            'name': s.name,
            'age': s.age,
            'gender': s.gender,
            'major': s.major,
            'class_name': s.class_name,
            'grades': json.loads(s.grades) if s.grades else {}
        })
    return jsonify(result)

@app.route('/api/students', methods=['POST'])
@login_required
@teacher_required
def api_add_student():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name required'}), 400
    grades = data.get('grades') or {}
    s = Student(
        name=name,
        age=int(data.get('age') or 0),
        gender=data.get('gender') or '',
        major=data.get('major') or '',
        class_name=data.get('class_name') or '',
        grades=json.dumps(grades)
    )
    db.session.add(s)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/students/<int:sid>', methods=['PUT'])
@login_required
@teacher_required
def api_update_student(sid):
    s = Student.query.get(sid)
    if not s:
        return jsonify({'error': 'not found'}), 404
    data = request.get_json() or {}
    for k in ['name', 'age', 'gender', 'major', 'class_name']:
        if k in data:
            setattr(s, k, data[k] if k != 'age' else int(data[k]))
    if 'grades' in data:
        s.grades = json.dumps(data['grades'])
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/students/<int:sid>', methods=['DELETE'])
@login_required
@teacher_required
def api_delete_student(sid):
    s = Student.query.get(sid)
    if not s:
        return jsonify({'error': 'not found'}), 404
    db.session.delete(s)
    db.session.commit()
    return jsonify({'ok': True})

# ---------- 成绩绘图 ----------
@app.route('/api/plot/grades.png')
@login_required
def api_plot():
    student_id = request.args.get('student_id')  # 注意参数名称要和前端一致
    subject = request.args.get('subject')

    plt.rcParams['font.sans-serif'] = ['SimHei']
    plt.rcParams['axes.unicode_minus'] = False

    fig, ax = plt.subplots(figsize=(6, 4))

    if student_id:
        # 学生总览柱状图
        s = Student.query.get(student_id)
        if not s or not s.grades:
            ax.text(0.5, 0.5, '无数据', ha='center', va='center', fontsize=14)
            ax.set_axis_off()
        else:
            grades = json.loads(s.grades)
            subjects = list(grades.keys())
            scores = [grades[subj] for subj in subjects]
            ax.bar(subjects, scores, color='skyblue')
            ax.set_title(f"{s.name}成绩分布")
            ax.set_ylabel("分数")
            ax.set_ylim(0, 100)

    elif subject:
        # 单科分布柱状图
        students = Student.query.all()
        names, scores = [], []
        for s in students:
            g = json.loads(s.grades) if s.grades else {}
            if subject in g:  # 只统计存在该科目的学生
                names.append(s.name)
                scores.append(g[subject])
        if not scores:
            ax.text(0.5, 0.5, '无数据', ha='center', va='center', fontsize=14)
            ax.set_axis_off()
        else:
            ax.bar(names, scores, color='orange')
            ax.set_title(f"{subject}成绩分布")
            ax.set_ylabel("分数")
            ax.set_ylim(0, 100)
            plt.xticks(rotation=45, ha='right')

    else:
        # 学生平均分柱状图，按指定科目过滤
        students = Student.query.all()
        names, avgs = [], []
        for s in students:
            g = json.loads(s.grades) if s.grades else {}
            if g:
                if subject:
                    # 如果指定了科目，只统计有该科目的学生
                    if subject in g:
                        names.append(s.name)
                        avgs.append(g[subject])
                else:
                    # 未指定科目，统计学生所有科目的平均分
                    names.append(s.name)
                    avgs.append(np.mean(list(g.values())))
        if not avgs:
            ax.text(0.5, 0.5, '无数据', ha='center', va='center', fontsize=14)
            ax.set_axis_off()
        else:
            ax.bar(names, avgs, color='lightgreen')
            ax.set_title(f"{subject+'平均成绩分布' if subject else '学生平均成绩分布'}")
            ax.set_ylabel("平均分")
            ax.set_ylim(0, 100)
            plt.xticks(rotation=45, ha='right')

    buf = BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format='png')
    plt.close(fig)
    buf.seek(0)
    return send_file(buf, mimetype='image/png')

# ---------- 单科成绩绘图 ----------

@app.route('/api/plot/subject/<subject_name>.png')
@login_required
def plot_subject(subject_name):
    plt.rcParams['font.sans-serif'] = ['SimHei']
    plt.rcParams['axes.unicode_minus'] = False

    fig, ax = plt.subplots(figsize=(8, 4))

    students = Student.query.all()
    names, scores = [], []

    for s in students:
        g = json.loads(s.grades) if s.grades else {}
        if subject_name in g:
            names.append(s.name)
            scores.append(g[subject_name])

    if not scores:
        ax.text(0.5, 0.5, '无数据', ha='center', va='center', fontsize=14)
        ax.set_axis_off()
    else:
        ax.bar(names, scores, color='skyblue')
        ax.set_title(f"{subject_name}成绩分布", fontsize=16)
        ax.set_ylabel("分数")
        ax.set_ylim(0, 100)
        plt.xticks(rotation=45, ha='right')

    buf = BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format='png')
    plt.close(fig)
    buf.seek(0)
    return send_file(buf, mimetype='image/png')

# ---------- 导出学生数据为 Excel ----------
@app.route('/api/students/export')
@login_required
@teacher_required
def api_export_students():
    students = Student.query.all()
    data = []
    for s in students:
        grades = json.loads(s.grades) if s.grades else {}
        row = {
            '姓名': s.name,
            '年龄': s.age,
            '性别': s.gender,
            '专业': s.major,
            '班级': s.class_name
        }
        row.update(grades)
        data.append(row)
    if not data:
        return jsonify({'error': '无学生数据可导出'}), 400
    df = pd.DataFrame(data)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='学生信息')
    output.seek(0)
    return send_file(output, as_attachment=True,
                     download_name='学生信息.xlsx',
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


# ---------- 从 Excel 导入学生数据 ----------
@app.route('/api/students/import', methods=['POST'])
@login_required
@teacher_required
def api_import_students():
    if 'file' not in request.files:
        return jsonify({'error': '缺少文件'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': '未选择文件'}), 400
    filename = secure_filename(file.filename)
    try:
        df = pd.read_excel(file)
    except Exception as e:
        return jsonify({'error': f'文件读取失败: {e}'}), 400

    required_cols = {'姓名', '年龄', '性别', '专业', '班级'}
    if not required_cols.issubset(df.columns):
        return jsonify({'error': 'Excel表头不正确，应包含：姓名、年龄、性别、专业、班级'}), 400

    count = 0
    for _, row in df.iterrows():
        name = str(row.get('姓名') or '').strip()
        if not name:
            continue
        grades = {col: row[col] for col in df.columns if col not in ['姓名', '年龄', '性别', '专业', '班级'] and pd.notna(row[col])}
        s = Student(
            name=name,
            age=int(row.get('年龄') or 0),
            gender=str(row.get('性别') or ''),
            major=str(row.get('专业') or ''),
            class_name=str(row.get('班级') or ''),
            grades=json.dumps(grades)
        )
        db.session.add(s)
        count += 1
    db.session.commit()
    return jsonify({'ok': True, 'count': count})



# ---------- 前端 ----------
@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    with app.app_context():
        init_db()
    app.run(debug=True)
