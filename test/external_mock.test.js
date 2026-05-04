const nodemailer = require('nodemailer');

jest.mock('nodemailer');

describe('External API Mocking - Email Service', () => {
  it('seharusnya menggunakan mock transport untuk mengirim email', async () => {
    // Arrange
    const sendMailMock = jest.fn().mockResolvedValue({ messageId: '12345' });
    nodemailer.createTransport.mockReturnValue({
      sendMail: sendMailMock,
    });

    const transporter = nodemailer.createTransport({
      host: 'smtp.example.com',
      port: 587,
    });

    const mailOptions = {
      from: 'admin@siakad.sch.id',
      to: 'siswa@siakad.sch.id',
      subject: 'Test Subject',
      text: 'Hello World',
    };

    // Act
    const info = await transporter.sendMail(mailOptions);

    // Assert
    expect(nodemailer.createTransport).toHaveBeenCalled();
    expect(sendMailMock).toHaveBeenCalledWith(mailOptions);
    expect(info.messageId).toBe('12345');
  });
});
