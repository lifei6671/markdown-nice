import React, {Component} from "react";
import {observer, inject} from "mobx-react";
import {Modal, Table, Button, Empty, message} from "antd";
import IndexDB from "../LocalHistory/indexdb";
import {countVisibleChars} from "../../utils/helper";

@inject("dialog")
@inject("content")
@observer
class DocumentListDialog extends Component {
  db = null;

  pageSize = 5;

  tableWrapRef = React.createRef();

  wasOpen = false;

  isFetching = false;

  constructor(props) {
    super(props);
    this.state = {
      articles: [],
      loading: false,
      loadingMore: false,
      hasMore: false,
    };
  }

  componentDidMount() {
    this.initIndexDB();
    this.wasOpen = this.props.dialog.isDocumentListOpen;
    if (this.wasOpen) {
      this.loadArticles();
    }
  }

  componentDidUpdate() {
    const isOpen = this.props.dialog.isDocumentListOpen;
    if (isOpen && !this.wasOpen) {
      this.loadArticles();
    }
    this.wasOpen = isOpen;
  }

  initIndexDB = async () => {
    try {
      const indexDB = new IndexDB({
        name: "articles",
        version: 2,
        storeName: "article_meta",
        storeOptions: {keyPath: "document_id", autoIncrement: true},
        storeInit: (objectStore, db) => {
          if (objectStore && !objectStore.indexNames.contains("name")) {
            objectStore.createIndex("name", "name", {unique: false});
          }
          if (objectStore && !objectStore.indexNames.contains("createdAt")) {
            objectStore.createIndex("createdAt", "createdAt", {unique: false});
          }
          if (objectStore && !objectStore.indexNames.contains("updatedAt")) {
            objectStore.createIndex("updatedAt", "updatedAt", {unique: false});
          }
          if (db && !db.objectStoreNames.contains("article_content")) {
            db.createObjectStore("article_content", {keyPath: "document_id"});
          }
        },
      });
      this.db = await indexDB.init();
    } catch (e) {
      console.error(e);
    }
  };

  getTimeValue = (value) => {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (value == null) {
      return 0;
    }
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  formatTime = (value) => {
    if (!value) {
      return "-";
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleString();
  };

  loadArticles = () => {
    this.fetchArticles(true);
  };

  loadMoreArticles = () => {
    this.fetchArticles(false);
  };

  fetchArticles = async (reset) => {
    if (this.isFetching || this.state.loading || this.state.loadingMore) {
      return;
    }
    if (!reset && !this.state.hasMore) {
      return;
    }
    this.isFetching = true;
    try {
      if (!this.db) {
        await this.initIndexDB();
      }
      if (!this.db) {
        message.error("初始化数据库失败");
        return;
      }
      const offset = reset ? 0 : this.state.articles.length;
      if (reset) {
        if (this.tableWrapRef.current) {
          this.tableWrapRef.current.scrollTop = 0;
        }
        this.setState({articles: [], loading: true, loadingMore: false, hasMore: false});
      } else {
        this.setState({loadingMore: true});
      }
      let {items, hasMore} = await this.loadArticleMetaPage(offset, this.pageSize);
      if (items.length === 0 && offset === 0 && this.db.objectStoreNames.contains("articles")) {
        await this.migrateLegacyArticles();
        ({items, hasMore} = await this.loadArticleMetaPage(offset, this.pageSize));
      }
      if (items.some((item) => item && item.charCount == null)) {
        items = await Promise.all(items.map((item) => this.ensureCharCount(item)));
      }
      this.setState((prevState) => ({
        articles: reset ? items : prevState.articles.concat(items),
        hasMore,
      }));
    } catch (e) {
      console.error(e);
      message.error("获取文档列表失败");
    } finally {
      this.isFetching = false;
      this.setState({loading: false, loadingMore: false});
    }
  };

  loadArticleMetaPage = (offset, limit) => {
    if (!this.db) {
      return Promise.resolve({items: [], hasMore: false});
    }
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["article_meta"], "readonly");
      const store = transaction.objectStore("article_meta");
      let request;
      let useIndex = false;
      let done = false;

      const finish = (payload) => {
        if (done) {
          return;
        }
        done = true;
        resolve(payload);
      };

      const fail = (event) => {
        if (done) {
          return;
        }
        done = true;
        reject(event);
      };

      try {
        if (store.indexNames && store.indexNames.contains("createdAt")) {
          const index = store.index("createdAt");
          request = index.openCursor(null, "prev");
          useIndex = true;
        }
      } catch (e) {
        useIndex = false;
      }

      if (!useIndex) {
        const all = [];
        request = store.openCursor();
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            all.push(cursor.value);
            cursor.continue();
          } else {
            all.sort((a, b) => this.getTimeValue(b.createdAt) - this.getTimeValue(a.createdAt));
            const items = all.slice(offset, offset + limit);
            finish({items, hasMore: all.length > offset + limit});
          }
        };
        request.onerror = fail;
        return;
      }

      const items = [];
      let hasSkipped = offset === 0;
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          finish({items, hasMore: false});
          return;
        }
        if (!hasSkipped) {
          hasSkipped = true;
          cursor.advance(offset);
          return;
        }
        if (items.length < limit) {
          items.push(cursor.value);
          cursor.continue();
          return;
        }
        finish({items, hasMore: true});
      };
      request.onerror = fail;
    });
  };

  handleLoadMore = () => {
    this.loadMoreArticles();
  };

  migrateLegacyArticles = async () => {
    if (!this.db || !this.db.objectStoreNames.contains("articles")) {
      return [];
    }
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["articles", "article_meta", "article_content"], "readwrite");
      const legacyStore = transaction.objectStore("articles");
      const metaStore = transaction.objectStore("article_meta");
      const contentStore = transaction.objectStore("article_content");
      const request = legacyStore.openCursor();
      const result = [];
      transaction.oncomplete = () => {
        result.sort((a, b) => this.getTimeValue(b.createdAt) - this.getTimeValue(a.createdAt));
        resolve(result);
      };
      transaction.onerror = (event) => reject(event);
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const legacy = cursor.value || {};
          const documentId = legacy.id;
          const content = legacy.content || "";
          const charCount = legacy.charCount != null ? legacy.charCount : countVisibleChars(content);
          const createdAt = legacy.createdAt || legacy.updatedAt || new Date();
          const updatedAt = legacy.updatedAt || createdAt;
          const meta = {
            document_id: documentId,
            name: legacy.name || "未命名.md",
            charCount,
            createdAt,
            updatedAt,
          };
          metaStore.put(meta);
          contentStore.put({
            document_id: documentId,
            content,
          });
          result.push(meta);
          cursor.continue();
        }
      };
      request.onerror = (event) => reject(event);
    });
  };

  ensureCharCount = async (article) => {
    if (!article || article.document_id == null || article.charCount != null) {
      return article;
    }
    if (!this.db) {
      return article;
    }
    return new Promise((resolve) => {
      const transaction = this.db.transaction(["article_content", "article_meta"], "readwrite");
      const contentStore = transaction.objectStore("article_content");
      const metaStore = transaction.objectStore("article_meta");
      const req = contentStore.get(article.document_id);
      req.onsuccess = () => {
        const content = (req.result && req.result.content) || "";
        const charCount = countVisibleChars(content);
        const nextArticle = {...article, charCount};
        metaStore.put(nextArticle);
        resolve(nextArticle);
      };
      req.onerror = () => resolve(article);
    });
  };

  loadIntoEditor = async (article) => {
    if (!article || article.document_id == null) {
      return;
    }
    if (!this.db) {
      await this.initIndexDB();
    }
    if (!this.db) {
      message.error("初始化数据库失败");
      return;
    }
    try {
      const content = await this.loadContent(article.document_id);
      this.props.content.setDocumentId(article.document_id);
      this.props.content.setDocumentName(article.name || "未命名.md");
      this.props.content.setDocumentUpdatedAt(article.updatedAt || article.createdAt || 0);
      this.props.content.setContent(content);
      const {markdownEditor} = this.props.content;
      if (markdownEditor) {
        markdownEditor.setValue(content);
        markdownEditor.focus();
      }
      this.props.dialog.setDocumentListOpen(false);
    } catch (e) {
      console.error(e);
      message.error("加载文档失败");
    }
  };

  loadContent = (documentId) => {
    return new Promise((resolve, reject) => {
      const stores = ["article_content"];
      if (this.db.objectStoreNames.contains("articles")) {
        stores.push("articles");
      }
      const transaction = this.db.transaction(stores, "readonly");
      const contentStore = transaction.objectStore("article_content");
      const req = contentStore.get(documentId);
      req.onsuccess = () => {
        if (req.result && req.result.content != null) {
          resolve(req.result.content);
          return;
        }
        if (stores.includes("articles")) {
          const legacyStore = transaction.objectStore("articles");
          const legacyReq = legacyStore.get(documentId);
          legacyReq.onsuccess = () => {
            resolve((legacyReq.result && legacyReq.result.content) || "");
          };
          legacyReq.onerror = (event) => reject(event);
          return;
        }
        resolve("");
      };
      req.onerror = (event) => reject(event);
    });
  };

  deleteArticle = async (article) => {
    if (!article || article.document_id == null) {
      return;
    }
    if (article.document_id === this.props.content.documentId) {
      message.warning("当前正在编辑该文档，不能删除。");
      return;
    }
    if (!this.db) {
      await this.initIndexDB();
    }
    if (!this.db) {
      message.error("初始化数据库失败");
      return;
    }
    Modal.confirm({
      title: "确认删除该文档？",
      okText: "删除",
      cancelText: "取消",
      okType: "danger",
      onOk: () =>
        new Promise((resolve, reject) => {
          const stores = ["article_meta", "article_content"];
          if (this.db.objectStoreNames.contains("articles")) {
            stores.push("articles");
          }
          const transaction = this.db.transaction(stores, "readwrite");
          const metaStore = transaction.objectStore("article_meta");
          const contentStore = transaction.objectStore("article_content");
          metaStore.delete(article.document_id);
          contentStore.delete(article.document_id);
          if (stores.includes("articles")) {
            transaction.objectStore("articles").delete(article.document_id);
          }
          transaction.oncomplete = () => {
            this.setState((prevState) => ({
              articles: prevState.articles.filter((item) => item.document_id !== article.document_id),
            }));
            message.success("删除成功");
            resolve();
          };
          transaction.onerror = (event) => {
            message.error("删除失败");
            reject(event);
          };
        }),
    });
  };

  render() {
    const columns = [
      {
        title: "文档名称",
        dataIndex: "name",
        key: "name",
        render: (text) => text || "未命名.md",
      },
      {
        title: "字符数",
        dataIndex: "charCount",
        key: "charCount",
        width: 120,
        render: (value) => (value != null ? value : "-"),
      },
      {
        title: "创建时间",
        dataIndex: "createdAt",
        key: "createdAt",
        width: 200,
        render: (value) => this.formatTime(value),
      },
      {
        title: "最后修改时间",
        dataIndex: "updatedAt",
        key: "updatedAt",
        width: 200,
        render: (value, record) => this.formatTime(value || record.createdAt),
      },
      {
        title: "操作",
        key: "action",
        width: 220,
        render: (_, record) => (
          <>
            <Button type="link" onClick={() => this.loadIntoEditor(record)}>
              编辑
            </Button>
            {/* antd v3 Button doesn't support `danger`; use inline color to avoid DOM warnings. */}
            <Button type="link" style={{color: "#ff4d4f"}} onClick={() => this.deleteArticle(record)}>
              删除
            </Button>
          </>
        ),
      },
    ];
    let loadMoreText = "没有更多";
    if (this.state.loadingMore) {
      loadMoreText = "加载中...";
    } else if (this.state.hasMore) {
      loadMoreText = "加载更多";
    }

    return (
      <Modal
        title="文档列表"
        visible={this.props.dialog.isDocumentListOpen}
        onCancel={() => this.props.dialog.setDocumentListOpen(false)}
        footer={null}
        width={1080}
      >
        <div ref={this.tableWrapRef} style={{maxHeight: "60vh", overflowY: "auto"}}>
          <Table
            rowKey="document_id"
            columns={columns}
            dataSource={this.state.articles}
            loading={this.state.loading}
            pagination={false}
            locale={{emptyText: <Empty description="暂无文档" />}}
          />
        </div>
        {this.state.articles.length > 0 && (
          <div style={{textAlign: "center", padding: "8px 0 0"}}>
            <Button type="link" onClick={this.handleLoadMore} disabled={!this.state.hasMore || this.state.loadingMore}>
              {loadMoreText}
            </Button>
          </div>
        )}
      </Modal>
    );
  }
}

export default DocumentListDialog;
