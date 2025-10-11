const { createApp, reactive, ref, computed, defineComponent, onMounted } = Vue;
const { ElMessage } = ElementPlus; // ✅ 引入消息提示

// ---------- 图表组件 ----------
const ChartComponent = defineComponent({
  props: ['plotUrl', 'studentId'],
  setup(props) {
    const chartType = ref('student'); // 'student' = 学生总览, 'subject' = 单科分布
    const selectedSubject = ref('');
    const refreshKey = ref(Date.now());
    const loading = ref(false);

    const computedUrl = computed(() => {
      if (chartType.value === 'student' && props.studentId) {
        return '/api/plot/grades.png?ts=' + refreshKey.value + '&student_id=' + props.studentId;
      }
      if (chartType.value === 'subject' && selectedSubject.value) {
        return '/api/plot/grades.png?ts=' + refreshKey.value + '&subject=' + encodeURIComponent(selectedSubject.value);
      }
      return '';
    });

    function refreshChart() {
      loading.value = true;
      refreshKey.value = Date.now();
      setTimeout(() => loading.value = false, 300);
    }

    return { chartType, selectedSubject, computedUrl, refreshChart, loading };
  },
  template: `
    <el-card class="chart-card" style="margin-top:16px;">
      <div class="chart-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div class="chart-title" style="font-weight:600;">成绩分布图</div>
        <div class="chart-controls" style="display:flex; gap:8px; align-items:center;">
          <el-select v-model="chartType" size="small" style="width:120px;">
            <el-option label="学生总览" value="student"></el-option>
            <el-option label="单科分布" value="subject"></el-option>
          </el-select>
          <el-input
            v-if="chartType==='subject'"
            v-model="selectedSubject"
            placeholder="输入科目名称"
            size="small"
            style="width:150px;"
          ></el-input>
          <el-button size="mini" @click="refreshChart">
            <i class="el-icon-refresh"></i> 刷新
          </el-button>
        </div>
      </div>
      <div class="chart-wrapper" v-if="computedUrl" style="height:300px;position:relative;">
        <img :src="computedUrl" style="width:100%; height:100%; object-fit:contain; border:1px solid #ebeef5; border-radius:4px; padding:6px; background:#fff"/>
        <div v-if="loading" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.6);font-weight:600;">加载中...</div>
      </div>
      <div v-else style="color:#909399; text-align:center;">暂无图表</div>
    </el-card>
  `
});

// ---------- 主应用 ----------
createApp({
  components: { 'chart-component': ChartComponent },
  setup() {
    const user = reactive({ logged_in: false, username: '', role: '' });
    const loginForm = reactive({ username: '', password: '' });
    const isRegister = ref(false);

    const students = ref([]);
    const selectedStudent = ref(null);
    const q = ref('');
    const dialogVisible = ref(false);
    const editing = reactive({ id: null, name: '', age: 18, gender: '', major: '', class_name: '', grades: [] });
    const users = ref([]);

    const filteredStudents = computed(() =>
      q.value ? students.value.filter(s => s.name.includes(q.value)) : students.value
    );

    async function checkLogin() {
      const res = await fetch('/api/me');
      const j = await res.json();
      if (j.logged_in) {
        user.logged_in = true;
        user.username = j.username;
        user.role = j.role;
        await loadStudents();
        if (user.role === 'teacher') await loadUsers();
      }
    }

    async function submit() {
      if (isRegister.value) {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loginForm)
        });
        const j = await res.json();
        if (res.ok) {
          ElMessage.success('注册成功，请登录');
          isRegister.value = false;
        } else {
          ElMessage.error('注册失败: ' + (j.error || '未知错误'));
        }
      } else {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loginForm)
        });
        const j = await res.json();
        if (res.ok) {
          user.logged_in = true;
          user.username = j.username;
          user.role = j.role;
          loginForm.password = '';
          await loadStudents();
          if (user.role === 'teacher') await loadUsers();
          ElMessage.success('登录成功');
        } else {
          ElMessage.error('登录失败: ' + (j.error || '用户名或密码错误'));
        }
      }
    }

    async function logout() {
      await fetch('/api/logout', { method: 'POST' });
      user.logged_in = false;
      user.username = '';
      user.role = '';
      students.value = [];
      selectedStudent.value = null;
      users.value = [];
    }

    async function loadStudents() {
      const res = await fetch('/api/students');
      const list = await res.json();
      students.value = Array.isArray(list) ? list : [];
    }

    function selectStudent(stu) {
      selectedStudent.value = Object.assign({}, stu);
    }

    function openAdd() {
      Object.assign(editing, { id: null, name: '', age: 18, gender: '', major: '', class_name: '', grades: [] });
      dialogVisible.value = true;
    }

    function openEdit(stu) {
      Object.assign(editing, {
        id: stu.id,
        name: stu.name,
        age: stu.age,
        gender: stu.gender,
        major: stu.major,
        class_name: stu.class_name,
        grades: Object.entries(stu.grades || {}).map(([sub, score]) => ({ subject: sub, score }))
      });
      dialogVisible.value = true;
    }

    function addGradeField() {
      editing.grades.push({ subject: '', score: 0 });
    }

    function removeGradeField(idx) {
      editing.grades.splice(idx, 1);
    }

    async function saveEditing() {
      if (!editing.name) { ElMessage.warning('请输入姓名'); return; }
      const payload = {
        name: editing.name,
        age: editing.age,
        gender: editing.gender,
        major: editing.major,
        class_name: editing.class_name,
        grades: Object.fromEntries(editing.grades.map(g => [g.subject, g.score]))
      };
      let res;
      if (editing.id) {
        res = await fetch(`/api/students/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (res.ok) {
        dialogVisible.value = false;
        await loadStudents();
        if (selectedStudent.value && selectedStudent.value.id === editing.id)
          selectStudent(payload);
        ElMessage.success('保存成功');
      } else {
        const j = await res.json();
        ElMessage.error('保存失败: ' + (j.error || '未知错误'));
      }
    }

    async function deleteStudent(stu) {
      if (!confirm('确认删除 ' + stu.name + ' ?')) return;
      const res = await fetch(`/api/students/${stu.id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadStudents();
        if (selectedStudent.value && selectedStudent.value.id === stu.id)
          selectedStudent.value = null;
        ElMessage.success('删除成功');
      }
    }

    async function loadUsers() {
      const res = await fetch('/api/users');
      const j = await res.json();
      users.value = Array.isArray(j) ? j : [];
    }

    async function deleteUser(u) {
      if (!confirm(`确认删除用户 ${u.username} ?`)) return;
      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadUsers();
        ElMessage.success('删除成功');
      } else {
        const j = await res.json();
        ElMessage.error('删除失败: ' + (j.error || '未知错误'));
      }
    }

    onMounted(() => checkLogin());

    return {
      user, loginForm, isRegister, submit, logout,
      students, selectedStudent, q, filteredStudents,
      dialogVisible, editing, selectStudent, openAdd, openEdit,
      saveEditing, deleteStudent, addGradeField, removeGradeField,
      users, deleteUser
    };
  },
  template: `
    <div>
      <!-- 登录 -->
   <div v-if="!user.logged_in" 
     class="login-container" 
     style="display: flex; justify-content: center; align-items: center; height: 100vh; padding: 20px; box-sizing: border-box;">
  <el-card class="login-card" style="width: 400px; max-width: 100%;">
    <div class="login-title" style="text-align: center; font-size: 20px; margin-bottom: 20px;">
      学生管理系统 {{ isRegister ? '注册':'登录' }}
    </div>
    <el-form :model="loginForm" label-position="top">
      <el-form-item label="用户名">
        <el-input v-model="loginForm.username" placeholder="请输入用户名"></el-input>
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="loginForm.password" placeholder="请输入密码" show-password></el-input>
      </el-form-item>
      <el-button type="primary" @click="submit" style="width: 100%;">{{ isRegister ? '注册':'登录' }}</el-button>
    </el-form>
    <el-button type="text" @click="isRegister=!isRegister" class="toggle-btn" style="margin-top: 10px; display: block; width: 100%;">
      {{ isRegister ? '已有账号？去登录':'没有账号？注册' }}
    </el-button>
  </el-card>
</div>




      <!-- 主应用 -->
      <div v-else class="app-wrap">
        <div class="left-panel">
          <div class="header">
            <div>学生列表</div>
            <el-button size="mini" type="primary" v-if="user.role==='teacher'" @click="openAdd">添加</el-button>
          </div>
          <el-input v-model="q" size="mini" placeholder="搜索姓名" class="search-input"></el-input>
          <div class="student-list">
            <div v-for="stu in filteredStudents" :key="stu.id" class="student-item" :class="{active:selectedStudent && selectedStudent.id===stu.id}" @click="selectStudent(stu)">
              {{stu.name}}
            </div>
          </div>
        </div>

        <div class="right-panel">
          <div class="header">
            <div>欢迎, <strong>{{user.username}}</strong> ({{user.role}})</div>
            <el-button size="small" @click="logout">退出</el-button>
          </div>

          <div v-if="selectedStudent" class="student-details">
            <div class="details-title">学生详情</div>
            <div class="detail-item"><div class="detail-key">姓名：</div><div class="detail-value">{{selectedStudent.name}}</div></div>
            <div class="detail-item"><div class="detail-key">年龄：</div><div class="detail-value">{{selectedStudent.age}}</div></div>
            <div class="detail-item"><div class="detail-key">性别：</div><div class="detail-value">{{selectedStudent.gender}}</div></div>
            <div class="detail-item"><div class="detail-key">专业：</div><div class="detail-value">{{selectedStudent.major}}</div></div>
            <div class="detail-item"><div class="detail-key">班级：</div><div class="detail-value">{{selectedStudent.class_name}}</div></div>
            <div class="detail-item" v-for="(score,subject) in selectedStudent.grades" :key="subject">
              <div class="detail-key">{{subject}}：</div><div class="detail-value">{{score}}</div>
            </div>
            <div class="actions">
              <el-button size="small" type="primary" v-if="user.role==='teacher'" @click="openEdit(selectedStudent)">编辑</el-button>
              <el-button size="small" type="danger" v-if="user.role==='teacher'" @click="deleteStudent(selectedStudent)">删除</el-button>
            </div>
          </div>
          <div v-else class="empty-msg">点击左侧姓名查看学生详情</div>

          <!-- 图表组件 -->
          <chart-component v-if="selectedStudent" :student-id="selectedStudent.id" />

          <div v-if="user.role==='teacher'" class="user-management">
            <div class="header">用户管理</div>
            <el-table :data="users" style="width:100%" size="small">
              <el-table-column prop="username" label="用户名"></el-table-column>
              <el-table-column prop="role" label="角色"></el-table-column>
              <el-table-column label="操作" width="120">
                <template #default="scope">
                  <el-button type="danger" size="mini" @click="deleteUser(scope.row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <el-dialog :title="editing.id? '编辑学生':'添加学生'" v-model="dialogVisible" :close-on-click-modal="false" width="500px">
          <el-form :model="editing" label-position="top">
            <el-form-item label="姓名"><el-input v-model="editing.name"></el-input></el-form-item>
            <el-form-item label="年龄"><el-input-number v-model="editing.age" :min="0"></el-input-number></el-form-item>
            <el-form-item label="性别">
              <el-select v-model="editing.gender" placeholder="性别">
                <el-option label="男" value="男"></el-option>
                <el-option label="女" value="女"></el-option>
                <el-option label="其他" value="其他"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="专业"><el-input v-model="editing.major"></el-input></el-form-item>
            <el-form-item label="班级"><el-input v-model="editing.class_name"></el-input></el-form-item>

            <div v-for="(g, idx) in editing.grades" :key="idx" class="grade-row" 
     style="display: flex; align-items: center; gap: 15px; padding: 10px 0; width: 100%;">
  <!-- 科目输入框，自适应宽度 -->
  <el-input v-model="g.subject" placeholder="科目" style="flex: 2;"></el-input>

  <!-- 分数输入框，自适应宽度 -->
  <el-input-number v-model="g.score" :min="0" :max="100" :step="0.1" style="flex: 1;"></el-input-number>

  <!-- 删除按钮靠右 -->
  <div style="display: flex; align-items: center; justify-content: flex-end; flex: 0;">
    <el-button type="danger" style="display: flex; align-items: center;" @click="removeGradeField(idx)">
      <span style="margin-left: 4px;">删除</span>
    </el-button>
  </div>
</div>


            <el-button type="primary" size="small" @click="addGradeField">添加科目</el-button>
          </el-form>
          <template #footer>
            <el-button @click="dialogVisible=false">取消</el-button>
            <el-button type="primary" @click="saveEditing">保存</el-button>
          </template>
        </el-dialog>
      </div>
    </div>
  `
}).use(ElementPlus).mount('#app');
