import React, {Component} from "react";
import {Input, Form} from "antd";
import {R2_IMAGE_HOSTING} from "../../utils/constant";

const formItemLayout = {
  labelCol: {
    xs: {span: 6},
  },
  wrapperCol: {
    xs: {span: 16},
  },
};

class R2 extends Component {
  constructor(props) {
    super(props);
    const imageHosting = JSON.parse(localStorage.getItem(R2_IMAGE_HOSTING));
    this.state = {
      imageHosting,
    };
  }

  accountIdChange = (e) => {
    const {imageHosting} = this.state;
    imageHosting.accountId = e.target.value;
    this.setState({imageHosting});
    localStorage.setItem(R2_IMAGE_HOSTING, JSON.stringify(imageHosting));
  };

  accessKeyIdChange = (e) => {
    const {imageHosting} = this.state;
    imageHosting.accessKeyId = e.target.value;
    this.setState({imageHosting});
    localStorage.setItem(R2_IMAGE_HOSTING, JSON.stringify(imageHosting));
  };

  secretAccessKeyChange = (e) => {
    const {imageHosting} = this.state;
    imageHosting.secretAccessKey = e.target.value;
    this.setState({imageHosting});
    localStorage.setItem(R2_IMAGE_HOSTING, JSON.stringify(imageHosting));
  };

  bucketChange = (e) => {
    const {imageHosting} = this.state;
    imageHosting.bucket = e.target.value;
    this.setState({imageHosting});
    localStorage.setItem(R2_IMAGE_HOSTING, JSON.stringify(imageHosting));
  };

  publicBaseUrlChange = (e) => {
    const {imageHosting} = this.state;
    imageHosting.publicBaseUrl = e.target.value;
    this.setState({imageHosting});
    localStorage.setItem(R2_IMAGE_HOSTING, JSON.stringify(imageHosting));
  };

  namespaceChange = (e) => {
    const {imageHosting} = this.state;
    imageHosting.namespace = e.target.value;
    this.setState({imageHosting});
    localStorage.setItem(R2_IMAGE_HOSTING, JSON.stringify(imageHosting));
  };

  render() {
    const {accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl, namespace} = this.state.imageHosting;
    return (
      <Form {...formItemLayout}>
        <Form.Item label="Account ID" style={style.formItem}>
          <Input value={accountId} onChange={this.accountIdChange} placeholder="例如：a1b2c3d4e5f6" />
        </Form.Item>
        <Form.Item label="Bucket" style={style.formItem}>
          <Input value={bucket} onChange={this.bucketChange} placeholder="例如：mdnice-images" />
        </Form.Item>
        <Form.Item label="AccessKey ID" style={style.formItem}>
          <Input value={accessKeyId} onChange={this.accessKeyIdChange} placeholder="例如：xxxx" />
        </Form.Item>
        <Form.Item label="SecretAccessKey" style={style.formItem}>
          <Input.Password value={secretAccessKey} onChange={this.secretAccessKeyChange} placeholder="例如：xxxx" />
        </Form.Item>
        <Form.Item label="Public URL" style={style.formItem}>
          <Input
            value={publicBaseUrl}
            onChange={this.publicBaseUrlChange}
            placeholder="例如：https://img.example.com/"
          />
        </Form.Item>
        <Form.Item label="Namespace" style={style.formItem}>
          <Input value={namespace} onChange={this.namespaceChange} placeholder="例如：image/" />
        </Form.Item>
        <Form.Item label="提示" style={style.formItem}>
          <span>
            Public URL 用于图片访问地址，建议绑定自定义域名。
            <a href="https://developers.cloudflare.com/r2/" target="_blank" rel="noreferrer">
              Cloudfare R2 配置文档
            </a>
          </span>
        </Form.Item>
      </Form>
    );
  }
}

const style = {
  formItem: {
    marginBottom: "10px",
  },
};

export default R2;
