const { createApp, reactive, ref, computed, defineComponent, onMounted } = Vue;

// ---------- 图表组件 ----------
const ChartComponent = defineComponent({
  props: ['plotUrl'],
  setup(props){
    const refreshKey = ref(Date.now());
    const computedUrl = computed(() => props.plotUrl + '?ts=' + refreshKey.value);
    function refreshChart() { refreshKey.value = Date.now(); }
    return { computedUrl, refreshChart };
  },
  template: `
    <el-card class="chart-card" style="margin-top:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div style="font-weight:600;">成绩分布图</div>
        <el-button size="mini" @click="refreshChart">刷新</el-button>
      </div>
      <div class="chart-wrapper" style="height:300px;">
        <img :src="computedUrl" style="width:100%; height:100%; object-fit:contain; border:1px solid #ebeef5; border-radius:4px; padding:6px; background:#fff"/>
      </div>
    </el-card>
  `
});

// ---------- 主应用 ----------
createApp({
  components: { 'chart-component': ChartComponent },
  setup(){
    // 登录/注册
    const user = reactive({ logged_in:false, username:'', role:'' });
    const loginForm = reactive({ username:'', password:'' });
    const isRegister = ref(false);

    // 学生管理
    const students = ref([]);
    const selectedStudent = ref(null);
    const q = ref('');
    const dialogVisible = ref(false);
    const editing = reactive({ id:null, name:'', age:18, gender:'', major:'', grade:0 });
    const plotUrl = ref('/api/plot/grades.png');
    const filteredStudents = computed(()=> q.value ? students.value.filter(s=>s.name.includes(q.value)) : students.value );

    // 用户管理（仅教师）
    const users = ref([]);
    const selectedUser = ref(null);

    // ---------- API ----------

    async function checkLogin(){
      const res = await fetch('/api/me');
      const j = await res.json();
      if(j.logged_in){
        user.logged_in=true;
        user.username=j.username;
        user.role=j.role;
        await loadStudents();
        if(user.role==='teacher') await loadUsers();
      }
    }

    async function submit(){
      if(isRegister.value){
        // 注册
        const res = await fetch('/api/register', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(loginForm)
        });
        const j = await res.json();
        if(res.ok){
          alert('注册成功，请登录');
          isRegister.value = false;
        } else alert('注册失败: ' + (j.error||''));
      } else {
        // 登录
        const res = await fetch('/api/login', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(loginForm)
        });
        const j = await res.json();
        if(res.ok){
          user.logged_in=true;
          user.username=j.username;
          user.role=j.role;
          loginForm.password='';
          await loadStudents();
          if(user.role==='teacher') await loadUsers();
        } else alert('登录失败: '+(j.error||''));
      }
    }

    async function logout(){
      await fetch('/api/logout',{method:'POST'});
      user.logged_in=false;
      user.username='';
      user.role='';
      students.value=[];
      selectedStudent.value=null;
      users.value=[];
    }

    // ---------- 学生管理 ----------
    async function loadStudents(){
      const res = await fetch('/api/students');
      const list = await res.json();
      students.value = Array.isArray(list) ? list : [];
    }

    function selectStudent(stu){ selectedStudent.value = Object.assign({}, stu); }
    function openAdd(){ Object.assign(editing,{id:null,name:'',age:18,gender:'',major:'',grade:0}); dialogVisible.value=true; }
    function openEdit(stu){ Object.assign(editing,stu); dialogVisible.value=true; }

    async function saveEditing(){
      if(!editing.name){ alert('请输入姓名'); return; }
      const payload = {name:editing.name, age:editing.age, gender:editing.gender, major:editing.major, grade:editing.grade};
      if(editing.id){
        const res = await fetch('/api/students/'+editing.id,{
          method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
        });
        if(res.ok){
          dialogVisible.value=false;
          await loadStudents();
          if(selectedStudent.value && selectedStudent.value.id===editing.id) selectStudent(payload);
        }
      } else {
        const res = await fetch('/api/students',{
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
        });
        if(res.ok){
          dialogVisible.value=false;
          await loadStudents();
        }
      }
    }

    async function deleteStudent(stu){
      if(!confirm('确认删除 '+stu.name+' ?')) return;
      const res = await fetch('/api/students/'+stu.id,{method:'DELETE'});
      if(res.ok){
        await loadStudents();
        if(selectedStudent.value && selectedStudent.value.id===stu.id) selectedStudent.value=null;
      }
    }

    // ---------- 用户管理 ----------
    async function loadUsers(){
      const res = await fetch('/api/users');
      const j = await res.json();
      users.value = Array.isArray(j)? j:[];
    }

    async function deleteUser(u){
      if(!confirm(`确认删除用户 ${u.username} ?`)) return;
      const res = await fetch(`/api/users/${u.id}`,{method:'DELETE'});
      if(res.ok){
        await loadUsers();
      } else {
        const j = await res.json();
        alert('删除失败: ' + (j.error||''));
      }
    }

    onMounted(()=>{ checkLogin(); });

    return {
      user, loginForm, isRegister, submit, logout,
      students, selectedStudent, q, filteredStudents,
      dialogVisible, editing, plotUrl, selectStudent, openAdd, openEdit, saveEditing, deleteStudent,
      users, deleteUser
    };
  },
  template: `
    <div>
      <!-- 登录/注册页面 -->
      <div v-if="!user.logged_in" class="login-container" style="
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
      ">
        <el-card class="login-card" style="width:400px;">
          <div style="font-size:20px; font-weight:600; margin-bottom:12px;">
            学生管理系统 {{ isRegister ? '注册' : '登录' }}
          </div>
          <el-form :model="loginForm" label-position="top">
            <el-form-item label="用户名">
              <el-input v-model="loginForm.username" placeholder="请输入用户名"></el-input>
            </el-form-item>
            <el-form-item label="密码">
              <el-input v-model="loginForm.password" placeholder="请输入密码" show-password></el-input>
            </el-form-item>
            <el-button type="primary" @click="submit" style="width:100%">
              {{ isRegister ? '注册' : '登录' }}
            </el-button>
          </el-form>
          <el-button type="text" @click="isRegister = !isRegister" style="margin-top:8px;">
            {{ isRegister ? '已有账号？去登录' : '没有账号？注册' }}
          </el-button>
        </el-card>
      </div>

      <!-- 主应用 -->
      <div v-else class="app-wrap">
        <!-- 左侧学生列表 -->
        <div class="left-panel">
          <div class="header">
            <div style="font-weight:600">学生列表</div>
            <el-button size="mini" type="primary" v-if="user.role==='teacher'" @click="openAdd">添加</el-button>
          </div>
          <el-input v-model="q" size="mini" placeholder="搜索姓名" style="margin-bottom:10px;"></el-input>
          <div v-for="stu in filteredStudents" :key="stu.id" class="student-item" 
               :class="{active:selectedStudent && selectedStudent.id===stu.id}" 
               @click="selectStudent(stu)">
            {{stu.name}}
          </div>
        </div>

        <!-- 右侧面板 -->
        <div class="right-panel">
          <div class="header">
            <div>欢迎, <strong>{{user.username}}</strong> ({{user.role}})</div>
            <el-button size="small" @click="logout">退出</el-button>
          </div>

          <!-- 学生详情 -->
          <div v-if="selectedStudent" class="student-details">
            <div style="font-size:18px;font-weight:600;margin-bottom:12px;">学生详情</div>
            <div class="detail-item"><div class="detail-key">姓名：</div><div class="detail-value">{{selectedStudent.name}}</div></div>
            <div class="detail-item"><div class="detail-key">年龄：</div><div class="detail-value">{{selectedStudent.age}}</div></div>
            <div class="detail-item"><div class="detail-key">性别：</div><div class="detail-value">{{selectedStudent.gender}}</div></div>
            <div class="detail-item"><div class="detail-key">专业：</div><div class="detail-value">{{selectedStudent.major}}</div></div>
            <div class="detail-item"><div class="detail-key">成绩：</div><div class="detail-value">{{selectedStudent.grade}}</div></div>
            <div class="actions">
              <el-button size="small" type="primary" v-if="user.role==='teacher'" @click="openEdit(selectedStudent)">编辑</el-button>
              <el-button size="small" type="danger" v-if="user.role==='teacher'" @click="deleteStudent(selectedStudent)">删除</el-button>
            </div>
          </div>
          <div v-else style="color:#909399; font-style:italic;">点击左侧姓名查看学生详情</div>

          <!-- 图表组件 -->
          <chart-component :plot-url="plotUrl" />

          <!-- 用户管理（仅管理员可见） -->
          <div v-if="user.role==='teacher'" style="margin-top:20px;">
            <div style="font-weight:600; margin-bottom:8px;">用户管理</div>
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

        <!-- 添加/编辑学生弹窗 -->
        <el-dialog :title="editing.id? '编辑学生':'添加学生'" v-model="dialogVisible" :close-on-click-modal="false">
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
            <el-form-item label="成绩"><el-input-number v-model="editing.grade" :min="0" :max="100" :step="0.1"></el-input-number></el-form-item>
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
