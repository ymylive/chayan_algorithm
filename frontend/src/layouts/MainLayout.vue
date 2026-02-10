<template>
  <el-container>
    <el-header><h2>茶颜分析系统</h2></el-header>
    <el-container>
      <el-aside width="200px">
        <el-menu :default-active="$route.path" router>
          <el-menu-item index="/">首页</el-menu-item>
          <el-menu-item index="/upload">上传数据</el-menu-item>
          <el-menu-item index="/analysis">数据分析</el-menu-item>
          <el-menu-item index="/recommendations">推荐结果</el-menu-item>
        </el-menu>
      </el-aside>
      <el-main><router-view /></el-main>
    </el-container>
  </el-container>
</template>
