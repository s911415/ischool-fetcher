(function () {
    const LIST_KEY = 'course_list';
    const STU_KEY = 'stu_no';
    const VIDEO_LIST = 'https://ischool.ntut.edu.tw/module/INWICAST/';
    const COURSE_SEARCH = 'https://ischool.ntut.edu.tw/learning/inc/lib/autocomplete_con.php';
    const CMD = [
        'ffmpeg',
        '-i',
        "{{presenter}}", //2
        '-i',
        "{{presentation}}", //4
        '-map 0',
        '-map 1:v',
        '-c:v libx264',
        '-c:a aac',
        '-preset:v slower',
        '-b:v:0 1850k',
        '-b:v:1 1000k',
        '-b:a 112k',
        '-strict -2',
        '-movflags faststart',
    ];
    Object.freeze(CMD);
    let currentList = null;

    function loadCourseList() {
        if (currentList !== null) return currentList;
        let ret = {};
        try {
            ret = JSON.parse(localStorage.getItem(LIST_KEY));
            if (!(ret.courseCodes instanceof Array)) {
                throw 'data error';
            }
        } catch (e) {
            ret = {
                courseCodes: [],
                data: {},
            };
        }

        currentList = ret;
        return ret;
    }

    function addManyCourseList(ssid, courseDataArr) {
        let courseList = loadCourseList();
        courseDataArr.forEach(courseData => {
            let code = courseData.code;
            let codeNum = code * 1;

            if (courseList.data[code] === undefined) {
                courseList.courseCodes.push(codeNum);
            }

            let title = courseData.intitule;
            let sem = title.match(/^(\d+)/)[0] * 1;

            courseList.data[code] = {
                sem,
                code,
                title,
                ssid,
            };
        });

        courseList.courseCodes.sort((a, b) => {
            const x = courseList.data[a], y = courseList.data[b];
            let semCmp = Math.sign(y.sem - x.sem);
            let titleCmp = x.title.localeCompare(y.title);
            let codeCmp = x.code.localeCompare(y.code);
            if (semCmp !== 0) return semCmp;
            if (titleCmp !== 0) return titleCmp;
            return codeCmp;
        });

        localStorage.setItem(LIST_KEY, JSON.stringify(courseList));
        return courseList;
    }

    function addCourseList(ssid, courseData) {
        return addManyCourseList(ssid, [courseData]);
    }

    const VideoRow = Vue.component('video-row', {
        props: {
            video: {
                type: Object
            },
        },
        methods: {
            selectAll: function (e) {
                e.target.select();
            }
        },
        computed: {
            cmd: function () {
                let cmds = [...CMD];
                cmds[2] = `"${this.presenterUrl}"`;
                cmds[4] = `"${this.presentationUrl}"`;
                cmds.push(`"${this.fileName}"`);

                return cmds.join(' ');
            },
            presenterUrl: function () {
                return `rtmp://${this.video.host}/lecture/${this.video.uuid}/presenter.flv`;
            },
            presentationUrl: function () {
                return `rtmp://${this.video.host}/lecture/${this.video.uuid}/presentation.flv`;
            },
            fileName: function () {
                let info = this.video.dateInfo.map(x => x.substr(x.length - 2));
                return [info.slice(0, 3).join(''), info.slice(3, 6).join(''), this.video.uuid].join('_') + '.mkv';
            }
        },
        template: `
<div class="col-md-4 col-sm-2">
    <div class="card">
        <img class="card-img-top" :src="video.image" alt="Screenshot">
        <div class="card-body">
            <div class="row">
                <div class="col-12">
                    <h5 class="card-title">{{video.title}}</h5>
                </div>
                <div class="col-12">
                    <div class="text-muted">
                        {{video.dateInfo[0]}}/{{video.dateInfo[1]}}/{{video.dateInfo[2]}}
                        {{video.dateInfo[3]}}:{{video.dateInfo[4]}}:{{video.dateInfo[5]}}
                    </div>
                </div>
            </div>
            <!--<p>UUID: {{video.uuid}}</p>-->
            <p></p>
            <p class="btn-group d-flex">
                <a role="button" :href="presentationUrl" class="btn btn-outline-primary w-100"><i class="material-icons">computer</i> PC</a>
                <a role="button" :href="presenterUrl" class="btn btn-outline-primary w-100"><i class="material-icons">photo_camera</i> Cam</a>
            </p>
            <p>
                <input type="text" @focus="selectAll($event)" :value="cmd" class="form-control"/>
            </p>
        </div>
    </div>
</div>
        `
    });

    let app = new Vue({
        el: '#app',
        components: {
            'video-row': VideoRow,
        },
        data: {
            stuNo: '',
            keyword: '',
            list: [],
            searchTimer: -1,
            courseNo: '',
            videos: [],
            loadingVideo: false,
        },
        watch: {
            'stuNo': function (newVal, oldVal) {
                localStorage.setItem(STU_KEY, newVal);
            },
        },
        created: function () {
            let stuNo = localStorage.getItem(STU_KEY);
            if (stuNo) {
                this.stuNo = stuNo;
            }

            let oldList = loadCourseList();
            let arr = [];
            oldList.courseCodes.forEach(code => {
                arr.push(oldList.data[code]);
            });

            this.list = arr;
        },
        methods: {
            fetchVideoList: function (e) {
                e.preventDefault();
                let url = new URL(VIDEO_LIST);
                url.searchParams.append("courseCode", this.courseNo);
                url.searchParams.append("rssFeed", loadCourseList().data[this.courseNo].ssid);
                this.loadingVideo = true;
                return fetch(url.toString(), {
                    method: 'GET',
                    cache: 'no-store',
                })
                    .then(x => x.text())
                    .then(rssContent => {
                        this.loadingVideo = false;
                        let parser = new DOMParser();
                        let xmlDoc = parser.parseFromString(rssContent, "text/xml");

                        let transform = (node) => {
                            let dateInfo = node.querySelector('pubDate').textContent.split(/[.:]/);
                            let url = new URL(node.querySelector('link').textContent.trim());
                            let img = node.querySelector('[url][width]').getAttribute('url');
                            let imgHostStart = img.indexOf('//') + 2;
                            let imgHostEnd = img.indexOf('/', imgHostStart);
                            // let date = new Date(Date.parse(`${dateInfo.slice(0, 3).join('/')} ${dateInfo.slice(3, 6).join(':')}`));
                            return {
                                title: node.querySelector('title').textContent,
                                dateInfo,
                                uuid: url.searchParams.get('vid'),
                                host: img.substring(imgHostStart, imgHostEnd),
                                image: `https://images.weserv.nl/?url=${img.substring(imgHostStart)}`,
                            }
                        };

                        let nodes = xmlDoc.querySelectorAll('channel>item');
                        let videos = new Array(nodes.length);
                        for (let i = 0, j = nodes.length; i < j; i++) {
                            videos[i] = transform(nodes[i]);
                        }

                        this.videos = videos;
                    })
                    .catch(e => {
                        console.error(e);
                        this.loadingVideo = false;
                    });
            },

            search: function () {
                if (this.searchTimer !== -1) clearTimeout(this.searchTimer);
                this.searchTimer = setTimeout(() => {
                    const keyword = this.keyword;
                    this.fetchCourseList()
                        .then(data => {
                            let list = loadCourseList();
                            let arr = [];
                            list.courseCodes.forEach(code => {
                                if (keyword === "" || list.data[code].title.indexOf(keyword) !== -1) {
                                    arr.push(list.data[code]);
                                }
                            });

                            this.list = arr;
                        });
                }, 500);
            },

            fetchCourseList: function () {
                let url = new URL(COURSE_SEARCH);
                url.searchParams.append("ssid", this.stuNo);
                url.searchParams.append("username", this.keyword);
                return fetch(url.toString(), {
                    method: 'GET',
                    cache: 'no-store',
                })
                    .then(x => x.json())
                    .then(data => {
                        addManyCourseList(this.stuNo, data);
                        return data;
                    });
            },
        },
        template: `
<div class="container">
    <form class="form" @submit="fetchVideoList($event)">
        <div class="row">
            <div class="col-sm-4 col-12">
                <div class="form-group">
                    <label for="stuNo">Student No:</label>
                    <input type="text" class="form-control" id="stuNo" v-model.trim:value="stuNo" required>
                </div>
            </div>    
            <div class="col-sm-8 col-12">
                <div class="form-group">
                    <label for="keyword">Keyword:</label>
                    <input type="text" class="form-control"
                        id="keyword" placeholder="請輸入關鍵字。如：學期、課名、課號。Ex:1022_靜力學_181234"
                        v-model.trim:value="keyword"
                        @input="search"
                    >
                </div>
            </div>    
        </div>
    
    
        <div class="form-group">
            <label for="course">Course:</label>
            <select v-model="courseNo" class="form-control input-sm" id="course" required>
                <option value="" v-if="list.length===0">[空]</option>
                <option value="" v-else>請選擇</option>
                <option v-for="(item, key, index) in list" :value="item.code">{{item.title}}</option>
            </select>
        </div>
        <button type="submit" class="btn btn-primary btn-block" :disabled="courseNo==='' || loadingVideo">Get Videos</button>
    </form>
    <hr/>
    <div id="videos">
        <div v-if="!loadingVideo">
            <div class="text-center" v-if="videos.length===0">
                <i class="material-icons">warning</i>
                <p>No Result</p>
            </div>
            <div class="row">
                <video-row :video="item" v-for="(item, key, index) in videos" :key="item.id"/>
            </div>
        </div>
        <div v-else>
            <img src="loading.svg" class="loading"/>
        </div>
        
    </div>
</div>
        `,
    });
})();
