import React, {Component} from "react";
import {observer, inject} from "mobx-react";
import {Modal, Input, Form, message} from "antd";
import IndexDB from "../LocalHistory/indexdb";

@inject("dialog")
@inject("content")
@observer
class NewFileDialog extends Component {
  db = null;

  constructor(props) {
    super(props);
    this.state = {
      name: "",
    };
  }

  componentDidMount() {
    this.initIndexDB();
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

  normalizeName = (name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return "";
    }
    if (trimmed.toLowerCase().endsWith(".md")) {
      return trimmed.slice(0, -3);
    }
    return trimmed;
  };

  buildFileName = (name) => {
    const normalized = this.normalizeName(name);
    if (!normalized) {
      return "";
    }
    return `${normalized}.md`;
  };

  saveArticle = (meta, content) => {
    if (!this.db) {
      return Promise.reject(new Error("indexeddb not ready"));
    }
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["article_meta", "article_content"], "readwrite");
      const metaStore = transaction.objectStore("article_meta");
      const contentStore = transaction.objectStore("article_content");
      let documentId = null;
      const req = metaStore.add(meta);
      req.onsuccess = (event) => {
        documentId = event.target.result;
        contentStore.put({
          document_id: documentId,
          content,
        });
      };
      req.onerror = (event) => reject(event);
      transaction.oncomplete = () => resolve(documentId);
      transaction.onerror = (event) => reject(event);
    });
  };

  clearEditor = () => {
    const {markdownEditor} = this.props.content;
    this.props.content.setContent("");
    if (markdownEditor) {
      markdownEditor.setValue("");
      markdownEditor.focus();
    }
  };

  handleOk = async () => {
    const fileName = this.buildFileName(this.state.name);
    if (!fileName) {
      message.error("请输入文件名称");
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
      const now = new Date();
      const documentId = await this.saveArticle(
        {
          name: fileName,
          charCount: 0,
          createdAt: now,
          updatedAt: now,
        },
        "",
      );
      if (documentId != null) {
        this.props.content.setDocumentId(documentId);
      }
      this.props.content.setDocumentName(fileName);
      this.props.content.setDocumentUpdatedAt(now);
      this.clearEditor();
      this.setState({name: ""});
      this.props.dialog.setNewFileOpen(false);
      message.success("新建文件成功！");
    } catch (e) {
      console.error(e);
      message.error("新建文件失败");
    }
  };

  handleCancel = () => {
    this.setState({name: ""});
    this.props.dialog.setNewFileOpen(false);
  };

  handleChange = (e) => {
    const value = this.normalizeName(e.target.value);
    this.setState({name: value});
  };

  render() {
    return (
      <Modal
        title="新建文件"
        okText="确认"
        cancelText="取消"
        visible={this.props.dialog.isNewFileOpen}
        onOk={this.handleOk}
        onCancel={this.handleCancel}
      >
        <Form.Item label="文件名称">
          <Input placeholder="请输入文件名称" value={this.state.name} onChange={this.handleChange} addonAfter=".md" />
        </Form.Item>
      </Modal>
    );
  }
}

export default NewFileDialog;
