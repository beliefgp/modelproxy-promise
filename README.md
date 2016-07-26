# modelproxy-promise

### 说明

该模块基于[modelproxy](https://github.com/carlisliu/modelproxy)改写，由于项目是在node新版本，基于co(Promise+Generator) 解决回调嵌套，所以在原基础上进行了部分改写。

### 安装

`npm install modelproxy-promise`

### 配置、初始化

接口配置、初始化同[modelproxy](https://github.com/carlisliu/modelproxy)。

### 调用方式

```js
var ModelProxy = require('modelproxy-promise'); 
var searchModel = ModelProxy.create([
		'Search.getPlayInfo',
		'Search.getAlbumList',
		'Search.getAlbumInfos' 
	]);


//单个使用，同es6源生Promise,每个请求有两个参数param，callback[可选],callback可对当前接口结果集进行重写
searchModel
	.getPlayInfo( {playId: 1}, data => 1 )
	.then(
		data => data//1
	)
	.catch(
		error => console.error(error)
	);
	
//多个并行调用，所有请求都成功，才执行最终结果,同Promise.all
searchModel
	.getPlayInfo( {playId: 1} )
	.getAlbumList( {albumId: 2} )
	.all()
	.then(
		dataArray => dataArray.map(data => data.result);
	)
	.catch(
		error => console.error(error)
	);

//多个并行调用，单个请求失败，不影响执行最终结果
searchModel
	.getPlayInfo( {playId: 1} )
	.getAlbumList( {albumId: 2}, data => new Error('data error') )
	.paral()
	.then(
		dataArray => dataArray.map(data => {
			if(data instanceof Error){
				return null;
			}
			return data.result;
		});
	)
	.catch(
		error => console.error(error)
	);

//多个串行调用，下一个请求参数依赖上一个接口返回的结果，
//第二个请求param要求为function，接收参数上一个接口返回结果和前面所有接口返回的结果集合，如果某个接口失败，调用catch
searchModel
	.getPlayInfo( {playId: 1}, data => data )
	.getAlbumList( playInfo => ({albumId: playInfo.albumId}) )
	.getAlbumInfos( (albumList, arrData) => ({albumId: albumList[0].id, playId: arrData[0].id}) )
	.series()
	.then(
		dataArray => dataArray.map(data => data.result)
	)
	.catch(
		error => console.error(error)
	);

```


