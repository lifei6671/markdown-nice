import React, {Component} from "react";
import {observer, inject} from "mobx-react";
import {Modal, Input, Form, message} from "antd";
import IndexDB from "../LocalHistory/indexdb";

@inject("dialog")
@inject("content")
@observer
class RenameFileDialog extends Component {
  db = null;

  wasOpen = false;

  constructor(props) {
    super(props);
    this.state = {
      name: "",
    };
  }

  componentDidMount() {
    this.initIndexDB();
    this.wasOpen = this.props.dialog.isRenameFileOpen;
    if (this.wasOpen) {
      this.resetNameFromStore();
    }
  }

  componentDidUpdate() {
    const isOpen = this.props.dialog.isRenameFileOpen;
    if (isOpen && !this.wasOpen) {
      this.resetNameFromStore();
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

  resetNameFromStore = () => {
    const currentName = this.props.content.documentName || "未命名.md";
    this.setState({name: this.normalizeName(currentName)});
  };

  normalizeName = (name) => {
    const trimmed = String(name || "").trim();
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

  updateDocumentName = async (documentId, name) => {
    if (!this.db) {
      await this.initIndexDB();
    }
    if (!this.db) {
      message.error("初始化数据库失败");
      return;
    }
    await new Promise((resolve, reject) => {
      const stores = ["article_meta"];
      if (this.db.objectStoreNames.contains("articles")) {
        stores.push("articles");
      }
      const transaction = this.db.transaction(stores, "readwrite");
      const metaStore = transaction.objectStore("article_meta");
      const metaReq = metaStore.get(documentId);
      metaReq.onsuccess = () => {
        const current = metaReq.result || {document_id: documentId};
        metaStore.put({...current, name});
        // Keep legacy store in sync for users who haven't migrated yet.
        if (stores.includes("articles")) {
          const legacyStore = transaction.objectStore("articles");
          const legacyReq = legacyStore.get(documentId);
          legacyReq.onsuccess = () => {
            if (legacyReq.result) {
              legacyStore.put({...legacyReq.result, name});
            }
          };
        }
      };
      metaReq.onerror = (event) => reject(event);
      transaction.oncomplete = () => resolve();
      transaction.onerror = (event) => reject(event);
    });
  };

  handleOk = async () => {
    const fileName = this.buildFileName(this.state.name);
    if (!fileName) {
      message.error("请输入文件名称");
      return;
    }
    const {documentId} = this.props.content;
    if (!documentId) {
      message.error("未找到当前文档");
      return;
    }
    try {
      await this.updateDocumentName(documentId, fileName);
      this.props.content.setDocumentName(fileName);
      this.props.dialog.setRenameFileOpen(false);
      message.success("重命名成功！");
    } catch (e) {
      console.error(e);
      message.error("重命名失败");
    }
  };

  handleCancel = () => {
    this.props.dialog.setRenameFileOpen(false);
  };

  handleChange = (e) => {
    const value = this.normalizeName(e.target.value);
    this.setState({name: value});
  };

  render() {
    return (
      <Modal
        title="重命名"
        okText="确认"
        cancelText="取消"
        visible={this.props.dialog.isRenameFileOpen}
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

export default RenameFileDialog;
